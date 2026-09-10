import "tdesign-react/es/_util/react-19-adapter";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "tdesign-react";
import zhCN from "tdesign-react/es/locale/zh_CN";
import "tdesign-react/es/style/index.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
	<ConfigProvider globalConfig={zhCN}>
		<App />
	</ConfigProvider>,
);
