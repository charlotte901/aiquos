import { useEffect, useRef, useState } from "react";
import { ArrowUp, X } from "@phosphor-icons/react";
import { streamDeepSeek } from "./deepseek";
import {
  detectNavigation,
  executeSkill,
  findCase,
  NAV_TARGET_LABEL,
  parseDirectives,
  searchCases,
  stripDirectives,
} from "./agent-skills.js";
import { AGENT_GREETING, AGENT_NAME, buildAgentMessages } from "./home-agent-chat";

const QUICK_ASKS = ["你是谁呀？", "带我去案例库看看", "推荐一个案例", "怎么开始 AI 测评？"];
const TEASER_KEY = "aiquos-agent-teaser-seen";

/** The floating agent on the homepage: a small resident robot 「小Q」 with a
 * chat fed by the DeepSeek proxy (streaming). Lives only on the home tab.
 *
 * Beyond chatting, the model can emit skill directives ([[go:forum]],
 * [[search-cases:黑猫]], [[recommend-case:id]], [[open-case:id]]) which the
 * panel strips from the visible text and executes: real navigation, live
 * library search hand-offs, and case cards rendered inside the chat. */
export function HomeAgent({ leaving = false, onNavigate = null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: AGENT_GREETING }]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // A one-time invitation bubble, unless this session already met 小Q.
  useEffect(() => {
    if (sessionStorage.getItem(TEASER_KEY)) return undefined;
    const show = setTimeout(() => setTeaser(true), 1400);
    const hide = setTimeout(() => setTeaser(false), 7200);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  // Keep the log pinned to the freshest message while it streams.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const toggle = () => {
    setOpen((value) => {
      const next = !value;
      if (next) {
        sessionStorage.setItem(TEASER_KEY, "1");
        setTeaser(false);
      } else {
        abortRef.current?.abort();
        setStreaming(false);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openCaseFromChat = (id) => {
    window.__aiquosPendingCase = id;
    window.dispatchEvent(new CustomEvent("aiquos:agent-handoff", {
      detail: { type: "open-case", id },
    }));
    onNavigate?.("forum");
  };

  const searchFromChat = (keyword) => {
    const found = searchCases(keyword);
    window.__aiquosPendingSearch = keyword;
    window.dispatchEvent(new CustomEvent("aiquos:agent-handoff", {
      detail: { type: "search-cases", keyword },
    }));
    onNavigate?.("forum");
    return found;
  };

  /** Run the skill directives a finished reply carries (at most two). */
  const runDirectives = (rawReply) => {
    for (const directive of parseDirectives(rawReply).slice(0, 2)) {
      executeSkill(directive, {
        go: (view) => {
          setMessages((current) => [
            ...current,
            { role: "assistant", content: "这就带你去 →" },
          ]);
          setTimeout(() => onNavigate?.(view), 550);
        },
        searchCases: (keyword) => {
          const found = searchFromChat(keyword);
          if (!found.length) {
            setMessages((current) => [
              ...current,
              { role: "assistant", content: `案例库里暂时没有和「${keyword}」相关的作品，换个关键词试试？` },
            ]);
          }
        },
        openCase: (id, action) => {
          const post = findCase(id);
          if (!post) return;
          if (action === "recommend-case") {
            setMessages((current) => [...current, { role: "assistant", content: "", cards: [post] }]);
          } else {
            openCaseFromChat(id);
          }
        },
      });
    }
  };

  const send = (raw) => {
    const text = (typeof raw === "string" ? raw : draft).trim();
    if (!text || streaming) return;

    // Skill first: navigation intents run locally — instant, and they work
    // even before a DeepSeek key is configured.
    const nav = detectNavigation(text);
    if (nav) {
      setMessages((current) => [
        ...current,
        { role: "user", content: text },
        { role: "assistant", content: `好嘞，这就带你去${NAV_TARGET_LABEL[nav.target]} →` },
      ]);
      sessionStorage.setItem(TEASER_KEY, "1");
      setTimeout(() => onNavigate?.(nav.target), 700);
      return;
    }

    const withReply = [...messages, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(withReply);
    setDraft("");
    setStreaming(true);
    sessionStorage.setItem(TEASER_KEY, "1");

    const controller = new AbortController();
    abortRef.current = controller;
    streamDeepSeek({
      messages: buildAgentMessages(withReply.slice(0, -1), { currentView: "home" }),
      signal: controller.signal,
      onDelta: (full) => {
        setMessages((current) => {
          const copy = [...current];
          copy[copy.length - 1] = { role: "assistant", content: stripDirectives(full) };
          return copy;
        });
      },
    })
      .then((complete) => {
        setStreaming(false);
        runDirectives(complete);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setStreaming(false);
        const detail = String(error?.message || "网络似乎开小差了。");
        const friendly = detail.includes("尚未配置")
          ? "我的大脑还没接上电（未配置 DeepSeek）。请在 .env.local 里填入 DEEPSEEK_API_KEY 并重启开发服务，我就能开口说话啦。"
          : `哎呀，出了点小状况：${detail}`;
        setMessages((current) => {
          const copy = [...current];
          copy[copy.length - 1] = { role: "assistant", content: friendly };
          return copy;
        });
      });
  };

  const onSubmit = (event) => {
    event.preventDefault();
    send();
  };

  const openCaseFromCard = (id) => {
    if (open) toggle();
    openCaseFromChat(id);
  };

  return (
    <div className={`home-agent${open ? " is-open" : ""}${leaving ? " is-leaving" : ""}`}>
      {open && (
        <section className="home-agent-panel" role="dialog" aria-label={`和${AGENT_NAME}对话`}>
          <header className="home-agent-head">
            <span className="home-agent-head-doll" aria-hidden="true">
              <span className="agent-visor">
                <i className="agent-eye" /><i className="agent-eye" />
              </span>
            </span>
            <div className="home-agent-head-meta">
              <strong>{AGENT_NAME}</strong>
              <span>{streaming ? "正在输入…" : "AIQUOS 智能体 · 在线"}</span>
            </div>
            <button type="button" className="home-agent-close" aria-label="收起对话"
              onClick={() => toggle()}>
              <X size={16} weight="bold" />
            </button>
          </header>

          <div className="home-agent-log" ref={listRef}>
            {messages.map((message, index) => {
              const isUser = message.role === "user";
              const isEmptyTail = !isUser && index === messages.length - 1 && !message.content && !message.cards;
              return (
                <div key={index} className={`home-agent-msg ${isUser ? "is-user" : "is-agent"}`}>
                  {isEmptyTail ? (
                    <span className="home-agent-typing" aria-label="小Q正在思考">
                      <i /><i /><i />
                    </span>
                  ) : (
                    message.content
                  )}
                  {message.cards && (
                    <div className="home-agent-cards">
                      {message.cards.map((post) => (
                        <button key={post.id} type="button" className="home-agent-card"
                          onClick={() => openCaseFromCard(post.id)}
                          aria-label={`打开案例：${post.title}`}>
                          {post.image && <img src={post.image} alt="" loading="lazy" />}
                          <span className="home-agent-card-meta">
                            <strong>{post.title}</strong>
                            <span>{post.tag} · ❤{post.likes}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {messages.length <= 1 && (
              <div className="home-agent-quicks">
                {QUICK_ASKS.map((ask) => (
                  <button key={ask} type="button" onClick={() => send(ask)}>{ask}</button>
                ))}
              </div>
            )}
          </div>

          <form className="home-agent-composer" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`和${AGENT_NAME}聊聊，或让我带路…`}
              aria-label="输入消息"
              maxLength={500}
            />
            <button type="submit" disabled={!draft.trim() || streaming} aria-label="发送">
              <ArrowUp size={15} weight="bold" />
            </button>
          </form>
        </section>
      )}

      {teaser && !open && (
        <div className="home-agent-teaser" aria-hidden="true">
          嗨，我是小Q，点我聊聊 AI~
        </div>
      )}

      <button
        type="button"
        className="home-agent-figure"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "收起智能体小Q" : "打开智能体小Q"}
        title="智能体小Q"
      >
        <span className="agent-doll" aria-hidden="true">
          <span className="agent-antenna"><i /></span>
          <span className="agent-body">
            <span className="agent-visor">
              <i className="agent-eye is-left" />
              <i className="agent-eye is-right" />
            </span>
            <span className="agent-arm is-left" />
            <span className="agent-arm is-right" />
          </span>
          <span className="agent-shadow" />
        </span>
      </button>
    </div>
  );
}
