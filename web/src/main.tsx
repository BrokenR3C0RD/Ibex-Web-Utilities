import { createRoot } from "react-dom/client";
import { App } from "./App";
import { UnsupportedBrowser, browserSupportsWebApis } from "./components/UnsupportedBrowser";
import "./index.css";
import "./global.sass";

createRoot(document.getElementById("root")!).render(
  browserSupportsWebApis ? <App /> : <UnsupportedBrowser />,
);
