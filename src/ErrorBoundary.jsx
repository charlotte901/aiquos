import { Component } from "react";

// One boundary per experience panel: the panels stay mounted while hidden, so
// without this a render error in any one of them takes down the whole site.
// The fallback offers recovery instead of a white screen.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // Best-effort diagnostics ring buffer (kept small, local only).
    try {
      const buffer = JSON.parse(localStorage.getItem("aiquos.error-ring.v1") ?? "[]");
      buffer.push({ message: String(error?.message ?? error), at: new Date().toISOString() });
      localStorage.setItem("aiquos.error-ring.v1", JSON.stringify(buffer.slice(-50)));
    } catch {
      // Storage unavailable: the visible fallback still works.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel-error" role="alert">
        <strong>这一页出了点问题</strong>
        <p>渲染中断，但你的测评数据保存在本机，不会丢失。</p>
        <div className="panel-error-actions">
          <button type="button" onClick={() => this.setState({ error: null })}>重试</button>
          <button type="button" onClick={() => { location.hash = "#home"; location.reload(); }}>返回首页</button>
        </div>
      </div>
    );
  }
}
