import { Component, type ErrorInfo, type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Production fallback: any uncaught render error paints a visible message in
// the otherwise-empty #root instead of leaving a blank white page on the
// deployed site, where there's no console to read.
function renderFatal(root: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : "";
  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "padding:16px;font:14px Hoefler Text,Garamond,serif;color:#2b1f12;background:#f0e2c4;min-height:100dvh;box-sizing:border-box";
  const h = document.createElement("h1");
  h.textContent = "Atlasaur failed to load";
  h.style.cssText = "font-size:18px;margin:0 0 8px";
  const p = document.createElement("p");
  p.textContent = message;
  p.style.cssText = "margin:0 0 12px;color:#a83b2c";
  const pre = document.createElement("pre");
  pre.textContent = stack;
  pre.style.cssText =
    "white-space:pre-wrap;font:12px ui-monospace,monospace;color:#5c4327;margin:0;overflow:auto";
  wrap.append(h, p, pre);
  root.append(wrap);
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Atlasaur render error:", error, info.componentStack);
  }
  render(): ReactNode {
    if (this.state.error) {
      const root = document.getElementById("root");
      if (root) renderFatal(root, this.state.error);
      return null;
    }
    return this.props.children;
  }
}

const root = document.getElementById("root")!;
try {
  createRoot(root).render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>,
  );
} catch (error) {
  renderFatal(root, error);
}
