import { useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { postApi } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { Alert, Avatar, Badge, Button, Card } from "../ui";

export function PostComposer({ onPosted }: { onPosted: () => void }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!content.trim() && files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("content", content);
      // Tác giả KHÔNG gửi trong body — backend lấy từ token.
      files.forEach((file) =>
        form.append(file.type.startsWith("video") ? "videos" : "images", file),
      );
      await postApi.create(form);
      setContent("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      onPosted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Avatar src={user?.avatarUrl ?? undefined} name={user?.username} />
        <textarea
          className="textarea grow"
          style={{ minHeight: 62 }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`${user?.username ?? "Bạn"} hôm nay thế nào?`}
        />
      </div>

      {files.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
          {files.map((file, index) => (
            <Badge key={`${file.name}-${index}`}>
              {file.name}
              <button
                onClick={() =>
                  setFiles((list) => list.filter((_, j) => j !== index))
                }
                style={{ border: 0, background: "none", cursor: "pointer" }}
                aria-label="Bỏ tệp"
              >
                ✕
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Alert>{error}</Alert>

      <div className="row-between" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <div className="row">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            🖼️ Ảnh / Video
          </Button>
        </div>
        <Button
          onClick={submit}
          disabled={busy || (!content.trim() && !files.length)}
        >
          {busy ? "Đang đăng…" : "Đăng bài"}
        </Button>
      </div>
    </Card>
  );
}
