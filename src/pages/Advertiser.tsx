import { useCallback, useEffect, useRef, useState } from "react";
import { AxiosError } from "axios";
import { errorMessage } from "../api/client";
import { adsApi, advertiserApi } from "../api/endpoints";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Modal,
  Spinner,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type {
  Advertisement,
  AdvertiserProfile,
  AdvertiserStatus,
} from "../types";

const STATUS_TONE: Record<AdvertiserStatus, "ok" | "warn" | "danger"> = {
  APPROVED: "ok",
  PENDING: "warn",
  SUSPENDED: "danger",
};

const STATUS_LABEL: Record<AdvertiserStatus, string> = {
  APPROVED: "Đã duyệt",
  PENDING: "Chờ duyệt",
  SUSPENDED: "Đã đình chỉ",
};

/**
 * Tư cách nhà quảng cáo là account capability (bảng advertiser_profiles), không
 * phải role. Trang này bám đúng vòng đời đó:
 *   chưa có hồ sơ → PENDING → APPROVED (mới đăng được quảng cáo) → SUSPENDED
 */
export function AdvertiserPage() {
  const { user, can } = useAuth();
  const [profile, setProfile] = useState<AdvertiserProfile | null>(null);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const mine = await advertiserApi.mine();
      setProfile(mine);
      if (user) setAds(await adsApi.list(user.id).catch(() => []));
    } catch (e) {
      // 404 nghĩa là chưa đăng ký hồ sơ — trạng thái bình thường, không phải lỗi
      if ((e as AxiosError)?.response?.status === 404) setProfile(null);
      else setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner />;

  if (!profile) {
    return (
      <Card>
        <CardHead
          title="Trở thành nhà quảng cáo"
          sub="Đăng ký hồ sơ để bắt đầu chạy quảng cáo trên Lopet"
        />
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          Hồ sơ được tạo ở trạng thái <b>Chờ duyệt</b>. Bạn chỉ đăng được quảng
          cáo sau khi quản trị viên duyệt.
        </div>
        <div className="field">
          <label>Tên công ty / thương hiệu</label>
          <input
            className="input"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
        <Alert>{error}</Alert>
        <Button
          disabled={!companyName.trim() || !can("advertiser:register")}
          onClick={async () => {
            try {
              await advertiserApi.register(companyName);
              load();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Gửi hồ sơ
        </Button>
      </Card>
    );
  }

  const approved = profile.status === "APPROVED";

  return (
    <>
      <Card>
        <CardHead
          title="Hồ sơ nhà quảng cáo"
          sub={profile.companyName ?? ""}
          action={
            <Badge tone={STATUS_TONE[profile.status]}>
              {STATUS_LABEL[profile.status]}
            </Badge>
          }
        />
        <div className="row" style={{ gap: 26, flexWrap: "wrap" }}>
          <div>
            <div className="faint">Số dư</div>
            <div style={{ fontWeight: 750, fontSize: 18 }}>
              {profile.balance.toLocaleString("vi-VN")} ₫
            </div>
          </div>
          <div>
            <div className="faint">Hạn mức / ngày</div>
            <div style={{ fontWeight: 750, fontSize: 18 }}>
              {profile.dailyLimit
                ? `${profile.dailyLimit.toLocaleString("vi-VN")} ₫`
                : "—"}
            </div>
          </div>
          <div>
            <div className="faint">Ngày duyệt</div>
            <div style={{ fontWeight: 750, fontSize: 18 }}>
              {profile.approvedAt
                ? new Date(profile.approvedAt).toLocaleDateString("vi-VN")
                : "—"}
            </div>
          </div>
        </div>

        {!approved && (
          <div className="alert alert-info" style={{ marginTop: 14 }}>
            {profile.status === "PENDING"
              ? "Hồ sơ đang chờ quản trị viên duyệt."
              : "Hồ sơ đã bị đình chỉ, bạn không thể đăng quảng cáo mới."}
          </div>
        )}
        <Alert>{error}</Alert>
      </Card>

      <Card>
        <CardHead
          title="Quảng cáo của tôi"
          action={
            <Button
              size="sm"
              disabled={!approved || !can("ads:create")}
              onClick={() => setComposing(true)}
            >
              + Tạo quảng cáo
            </Button>
          }
        />
        {ads.length === 0 ? (
          <EmptyState icon="📣" title="Chưa có quảng cáo nào" />
        ) : (
          <div className="stack">
            {ads.map((ad) => (
              <div key={ad.id} className="row">
                {ad.imageUrl && (
                  <img
                    src={ad.imageUrl}
                    alt=""
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 12,
                      objectFit: "cover",
                    }}
                  />
                )}
                <div className="grow truncate">
                  <div style={{ fontWeight: 650 }}>{ad.title}</div>
                  <div className="faint truncate">{ad.description}</div>
                  {ad.linkReferfence && (
                    <a
                      className="faint truncate"
                      href={ad.linkReferfence}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {ad.linkReferfence}
                    </a>
                  )}
                </div>
                {can("ads:update:own") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingAd(ad)}
                  >
                    Sửa
                  </Button>
                )}
                {can("ads:delete:own") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm("Xoá quảng cáo này?")) return;
                      try {
                        await adsApi.remove(ad.id);
                        load();
                      } catch (e) {
                        setError(errorMessage(e));
                      }
                    }}
                  >
                    Xoá
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {composing && (
        <AdFormModal
          onClose={() => setComposing(false)}
          onSaved={() => {
            setComposing(false);
            load();
          }}
        />
      )}

      {editingAd && (
        <AdFormModal
          ad={editingAd}
          onClose={() => setEditingAd(null)}
          onSaved={() => {
            setEditingAd(null);
            load();
          }}
        />
      )}
    </>
  );
}

/**
 * Dùng chung cho tạo và sửa. Lưu ý: cả POST lẫn PUT của backend đều upload ảnh
 * ngay đầu controller và sẽ lỗi nếu thiếu file, nên khi SỬA vẫn phải chọn lại
 * ảnh — đó là ràng buộc của API chứ không phải lựa chọn giao diện.
 */
function AdFormModal({
  ad,
  onClose,
  onSaved,
}: {
  ad?: Advertisement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(ad?.title ?? "");
  const [description, setDescription] = useState(ad?.description ?? "");
  const [linkRef, setLinkRef] = useState(ad?.linkReferfence ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Cần chọn ảnh quảng cáo — API yêu cầu ảnh ở cả tạo mới lẫn cập nhật.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("description", description);
      form.append("linkRef", linkRef);
      form.append("image", file);
      // Validation của backend cho POST còn đòi thêm `content` và `accountId`
      if (!ad) form.append("content", description);
      if (ad) await adsApi.update(ad.id, form);
      else await adsApi.create(form);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={ad ? "Sửa quảng cáo" : "Tạo quảng cáo"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={busy || !title.trim()}>
            {ad ? "Lưu" : "Đăng"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label>Tiêu đề</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Mô tả</label>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Đường dẫn đích</label>
        <input
          className="input"
          value={linkRef}
          onChange={(e) => setLinkRef(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="field">
        <label>Ảnh quảng cáo</label>
        <input ref={fileRef} className="input" type="file" accept="image/*" />
      </div>
      <Alert>{error}</Alert>
      {!ad && (
        <div className="alert alert-info">
          Lưu ý: route POST /v1/advertisements chạy Joi validate TRƯỚC
          upload.single(), nên với request multipart thì req.body còn rỗng và
          backend luôn trả “Validation error”. Cần đảo thứ tự middleware ở
          backend thì nút Đăng mới hoạt động.
        </div>
      )}
    </Modal>
  );
}
