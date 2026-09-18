import { useEffect, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { TestWordmark } from "./TestWordmark";
import { useStageSize } from "./DesignStage";
import { PROFILE_CARDS, PROFILE_ART, PROFILE_WORDMARK, getProfileLayout } from "./profile-layout";

/** Cut one card's pixels out of the source art once, then let object-fit
 * cover any box shape without the stretch-fit distortion that bent the
 * narrower cards sideways. */
function ProfileCardArt({ crop }) {
  const [x, y, width, height] = crop;
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    const source = new Image();
    source.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(source, x, y, width, height, 0, 0, width, height);
      setSrc(canvas.toDataURL("image/png"));
    };
    source.src = PROFILE_ART;
    return () => {
      cancelled = true;
      source.onload = null;
    };
  }, [x, y, width, height]);
  if (!src) return null;
  return <img className="profile-art" src={src} alt="" draggable="false" />;
}

export function ProfileHub({ onBack, onOpen, busy }) {
  const size = useStageSize();
  const layout = getProfileLayout(size.width, size.height);
  return (
    <main className="profile-screen" data-compact={layout.compact} style={layout.variables} aria-label="个人中心">
      <button className="assessment-back" onClick={onBack} disabled={busy}>
        <ArrowLeft size={18} /> 返回选择
      </button>
      <div className="profile-layout">
        <h1 className="profile-wordmark" tabIndex={-1} aria-label="个人中心">
          <TestWordmark reference={PROFILE_ART} crop={PROFILE_WORDMARK} />
        </h1>
        <div className="profile-grid" role="group" aria-label="个人中心功能">
          {PROFILE_CARDS.map((item) => (
            <button key={item.id} className="profile-card"
              aria-label={`${item.title} · ${item.subtitle}`}
              aria-pressed={undefined}
              disabled={busy}
              onClick={() => onOpen?.(item.id)}>
              <ProfileCardArt crop={item.crop} />
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
