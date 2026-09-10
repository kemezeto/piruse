import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, SocketPayload } from "@protocol/commands";
import type { ViewState } from "@protocol/view";

export type Line = "connecting" | "live" | "reconnecting";

export type HostCommand = (message: ClientMessage) => void;

export function useHost(): {
	state: ViewState | null;
	notice: string;
	line: Line;
	sendCommand: HostCommand;
	sendPrompt: (text: string) => void;
} {
	const [state, setState] = useState<ViewState | null>(null);
	const [notice, setNotice] = useState("");
	const [line, setLine] = useState<Line>("connecting");
	const socketRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		let closed = false;
		let timer: number | undefined;
		const connect = (): void => {
			const protocol = location.protocol === "https:" ? "wss" : "ws";
			const socket = new WebSocket(`${protocol}://${location.host}/ws`);
			socketRef.current = socket;
			socket.onopen = () => {
				if (!closed) setLine("live");
			};
			socket.onmessage = (event) => {
				const message = JSON.parse(String(event.data)) as SocketPayload;
				if (message.type === "state") setState(message.state);
				if (message.type === "notice") setNotice(message.text);
			};
			socket.onclose = () => {
				if (closed) return;
				setLine("reconnecting");
				timer = window.setTimeout(connect, 800);
			};
		};
		connect();
		return () => {
			closed = true;
			if (timer) window.clearTimeout(timer);
			socketRef.current?.close();
		};
	}, []);

	const sendCommand = useCallback<HostCommand>((message) => {
		const socket = socketRef.current;
		if (socket?.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify(message));
		setNotice("");
	}, []);

	const sendPrompt = useCallback(
		(text: string): void => {
			if (!text.trim()) return;
			sendCommand({ type: "prompt", text: text.trim() });
		},
		[sendCommand],
	);

	return { state, notice, line, sendCommand, sendPrompt };
}
