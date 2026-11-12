"use client";
import { useActionState } from "react";
import { updateMember } from "./actions";
export function MemberControls({
  companyId,
  revision,
  member,
  commandId,
}: {
  companyId: string;
  revision: number;
  commandId: string;
  member: {
    user_id: string;
    display_name: string;
    role: string;
    status: string;
  };
}) {
  const [state, action, pending] = useActionState(updateMember, {
    error: "",
    success: "",
  });
  return (
    <details className="sv-member-edit">
      <summary>管理權限</summary>
      <form action={action} className="sv-login-form">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="target" value={member.user_id} />
        <input type="hidden" name="revision" value={revision} />
        <input type="hidden" name="commandId" value={commandId} />
        <label>
          顯示名稱
          <input
            name="name"
            defaultValue={member.display_name}
            required
            maxLength={80}
          />
        </label>
        <label>
          角色
          <select name="role" defaultValue={member.role}>
            <option value="manager">管理員</option>
            <option value="agent">客服／營運</option>
            <option value="viewer">只可檢視</option>
          </select>
        </label>
        <label>
          帳戶狀態
          <select name="status" defaultValue={member.status}>
            <option value="active">啟用</option>
            <option value="suspended">暫停</option>
            <option value="removed">移除存取權（保留記錄）</option>
          </select>
        </label>
        <p>暫停或移除會阻止下一次公司資料操作；歷史客戶及交易記錄保留。</p>
        <label>
          <input type="checkbox" required />
          我已核對此同事嘅角色及存取權
        </label>
        <button disabled={pending}>
          {pending ? "正在儲存…" : "確認更新權限"}
        </button>
        {state.error && <p role="alert">{state.error}</p>}
        {state.success && <p role="status">{state.success}</p>}
      </form>
    </details>
  );
}
