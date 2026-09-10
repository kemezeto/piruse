import { Dialog } from "tdesign-react";

export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel,
	cancelLabel = "取消",
	busy = false,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	title: string;
	body: string;
	confirmLabel: string;
	cancelLabel?: string;
	busy?: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog
			visible={open}
			header={title}
			confirmBtn={confirmLabel}
			cancelBtn={cancelLabel}
			confirmLoading={busy}
			closeBtn={!busy}
			closeOnOverlayClick={!busy}
			closeOnEscKeydown={!busy}
			placement="center"
			destroyOnClose
			onClose={() => {
				if (!busy) onCancel();
			}}
			onConfirm={() => onConfirm()}
		>
			{body}
		</Dialog>
	);
}
