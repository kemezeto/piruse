import { Dialog } from "tdesign-react";

export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel,
	cancelLabel = "取消",
	busy = false,
	danger = false,
	onCancel: handleCancel,
	onConfirm,
}: {
	open: boolean;
	title: string;
	body: string;
	confirmLabel: string;
	cancelLabel?: string;
	busy?: boolean;
	danger?: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const close = (): void => {
		if (!busy) handleCancel();
	};
	return (
		<Dialog
			visible={open}
			header={title}
			confirmBtn={danger ? { content: confirmLabel, theme: "danger" } : confirmLabel}
			cancelBtn={cancelLabel}
			confirmLoading={busy}
			closeBtn={!busy}
			closeOnOverlayClick={!busy}
			closeOnEscKeydown={!busy}
			placement="center"
			destroyOnClose
			onClose={close}
			onCancel={close}
			onConfirm={() => onConfirm()}
		>
			{body}
		</Dialog>
	);
}
