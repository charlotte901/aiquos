import { useState, useEffect } from "react";
import { Sparkle, Sliders, Play, CaretUp, CaretDown } from "@phosphor-icons/react";
import { getStoredScheme, setStoredScheme } from "./LoginTransitionOverlay";

export const SCHEMES = [
  {
    id: "A",
    name: "方案 A · 3D 邮票迎风飞行",
    desc: "纸张受阻曲面形变 · 边缘齿孔 · 全息光泽 · 砸向屏幕",
  },
  {
    id: "B",
    name: "方案 B · 3D 屏幕弹射翻转",
    desc: "解构立方体右侧屏 · 抛物线跳跃 · 空中翻转 180° 双面",
  },
  {
    id: "C",
    name: "方案 C · 3D 纸艺折纸展开",
    desc: "三段铰链折叠结构 · 伴随风动舒展 · 折痕阴影压平",
  },
];

export function SchemeSwitcher({ currentScheme, onSelectScheme, onTriggerDemo }) {
  const [collapsed, setCollapsed] = useState(false);

  const handleSelect = (id) => {
    setStoredScheme(id);
    onSelectScheme(id);
  };

  return (
    <div className={`scheme-switcher-dock${collapsed ? " is-collapsed" : ""}`}>
      <header className="scheme-switcher-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="switcher-title">
          <Sparkle size={17} weight="fill" />
          <span>3D 登录转场动效方案</span>
          <span className="current-badge">{currentScheme} 方案</span>
        </div>
        <button
          type="button"
          className="switcher-toggle-btn"
          aria-label={collapsed ? "展开方案选择器" : "收起方案选择器"}
        >
          {collapsed ? <CaretDown size={15} weight="bold" /> : <CaretUp size={15} weight="bold" />}
        </button>
      </header>

      {!collapsed && (
        <div className="scheme-switcher-body">
          <div className="scheme-options">
            {SCHEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`scheme-option-btn${currentScheme === item.id ? " is-active" : ""}`}
                onClick={() => handleSelect(item.id)}
              >
                <div className="option-headline">
                  <span className="option-pill">{item.id}</span>
                  <strong>{item.name}</strong>
                </div>
                <p className="option-desc">{item.desc}</p>
              </button>
            ))}
          </div>

          <div className="scheme-switcher-footer">
            <button
              type="button"
              className="scheme-test-action"
              onClick={onTriggerDemo}
              title="立即触发进入登录界面体验转场动效"
            >
              <Play size={14} weight="fill" />
              <span>立即体验当前 3D 转场</span>
            </button>
            <span className="switcher-hint">支持返回首页反向回放</span>
          </div>
        </div>
      )}
    </div>
  );
}
