import { useState } from "react";
import { errorMessage } from "../../api/client";
import { reportApi } from "../../api/endpoints";
import type { ReportType } from "../../types";
import { Alert, Button, Modal } from "../ui";

const LABEL: Record<ReportType, string> = {
  POST: "bài viết",
  USER: "người dùng",
  GROUP: "nhóm",
};

/**
 * Một hộp thoại dùng chung cho cả ba loại đối tượng backend nhận báo cáo
 * (REPORTTYPE = USER | GROUP | POST). Quyền report:create nằm trong baseline
 * nên mọi tài khoản đã đăng nhập đều gửi được.
 */
export function ReportDialog({
  open,
  type,
  targetId,
  onClose,
}: {
  open: boolean;
  type: ReportType;
  targetId: number;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await reportApi.create(targetId, type, reason);
      setDone(true);
      setReason("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setDone(false);
    setError("");
    onClose();
  }

  return (
    <Modal
      open={open}
      title={`Báo cáo ${LABEL[type]}`}
      onClose={close}
      footer={
        done ? (
          <Button onClick={close}>Đóng</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Huỷ
            </Button>
            <Button
              variant="danger"
              onClick={submit}
              disabled={busy || !reason.trim()}
            >
              Gửi báo cáo
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Alert kind="ok">
          Đã gửi báo cáo. Đội kiểm duyệt sẽ xem xét {LABEL[type]} này.
        </Alert>
      ) : (
        <>
          <div className="field">
            <label>Lý do</label>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mô tả vi phạm…"
            />
          </div>
          <Alert>{error}</Alert>
        </>
      )}
    </Modal>
  );
}
