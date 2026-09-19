import { useEffect, useRef, useState } from "react";
import { ArrowUp, X } from "@phosphor-icons/react";
import { streamDeepSeek } from "./deepseek";
import { AGENT_GREETING, AGENT_NAME, buildAgentMessages } from "./home-agent-chat";

const QUICK_ASKS = ["你是谁呀？", "怎么开始 AI 测评？", "案例库有什么好玩的？"];
const TEASER_KEY = "aiquos-agent-teaser-seen";

/** The floating agent on the homepage: a small resident robot 「小Q」 with a
 * chat fed by the DeepSeek proxy (streaming). Lives only on the home tab. */
export function HomeAgent({ leaving = false }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: AGENT_GREETING }]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const seenRef = useRef(false);

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

  const send = (raw) => {
    const text = (typeof raw === "string" ? raw : draft).trim();
    if (!text || streaming) return;
    const withReply = [...messages, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(withReply);
    setDraft("");
    setStreaming(true);
    sessionStorage.setItem(TEASER_KEY, "1");

    const controller = new AbortController();
    abortRef.current = controller;
    streamDeepSeek({
      messages: buildAgentMessages(withReply.slice(0, -1)),
      signal: controller.signal,
      onDelta: (full) => {
        setMessages((current) => {
          const copy = [...current];
          copy[copy.length - 1] = { role: "assistant", content: full };
          return copy;
        });
      },
    })
      .then(() => setStreaming(false))
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
              const isEmptyTail = !isUser && index === messages.length - 1 && !message.content;
              return (
                <div key={index} className={`home-agent-msg ${isUser ? "is-user" : "is-agent"}`}>
                  {isEmptyTail ? (
                    <span className="home-agent-typing" aria-label="小Q正在思考">
                      <i /><i /><i />
                    </span>
                  ) : (
                    message.content
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
              placeholder={`和${AGENT_NAME}聊聊…`}
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
