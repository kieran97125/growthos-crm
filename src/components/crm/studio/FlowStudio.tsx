"use client";
import { useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  type Connection,
  type NodeChange,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  GitBranch,
  History,
  LayoutGrid,
  ListChecks,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { Modal } from "../conversations/WorkspacePrimitives";
import { uid, actionTime } from "../conversations/events";
import { BRANDS } from "../conversations/model";
import {
  DEFAULT_SIMULATION,
  simulateFlow,
  validateFlow,
  type SimulationInput,
  type SimulationResult,
} from "./engine";
import {
  NODE_META,
  kinds,
  makeNode,
  type Flow,
  type FlowNode,
  type Kind,
} from "./model";
import { NodeGlyph, StudioStatus } from "./StudioUI";
import type { StudioController } from "./useStudioStore";
import "@xyflow/react/dist/style.css";
import "./studio.css";

type CanvasNode = Node<{ node: FlowNode; step?: string }, "business">;
function BusinessNode({ data, selected }: NodeProps<CanvasNode>) {
  const n = data.node;
  const outputs =
    n.kind === "intent"
      ? [
          { id: "faq", label: "查詢" },
          { id: "booking", label: "預約" },
          { id: "handoff", label: "真人" },
        ]
      : n.kind === "condition"
        ? [
            { id: "new", label: "新客" },
            { id: "existing", label: "現客" },
          ]
        : null;
  return (
    <div
      className={`st-flow-node ${selected ? "is-selected" : ""} ${data.step ? `st-node-${data.step}` : ""}`}
    >
      {n.kind !== "trigger" && (
        <Handle
          type="target"
          position={Position.Top}
          role="group"
          aria-label="輸入連線"
        />
      )}
      <header>
        <NodeGlyph kind={n.kind} />
        <span>{NODE_META[n.kind].title}</span>
        {data.step === "completed" && <Check size={13} />}
        {data.step === "waiting" && <Clock3 size={13} />}
      </header>
      <strong>{n.title}</strong>
      <p>{n.description}</p>
      {outputs ? (
        <div className="st-node-outputs">
          {outputs.map((o, i) => (
            <span key={o.id}>
              {o.label}
              <Handle
                id={o.id}
                type="source"
                role="group"
                position={Position.Bottom}
                style={{ left: `${((i + 1) / (outputs.length + 1)) * 100}%` }}
                aria-label={`${o.label}出口`}
              />
            </span>
          ))}
        </div>
      ) : !["answer", "reminder", "handoff", "end"].includes(n.kind) ? (
        <Handle
          type="source"
          role="group"
          position={Position.Bottom}
          aria-label="下一步出口"
        />
      ) : null}
    </div>
  );
}
const nodeTypes = { business: BusinessNode };
const branchLabels: Record<string, string> = {
  faq: "一般查詢",
  booking: "預約意向",
  handoff: "真人協助",
  new: "新客",
  existing: "現客",
};

export default function FlowStudio({
  studio,
  onInbox,
}: {
  studio: StudioController;
  onInbox: () => void;
}) {
  const { state, dispatch } = studio;
  const [flowId, setFlowId] = useState(state.flows[0].id);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [library, setLibrary] = useState(false);
  const [modal, setModal] = useState<"simulate" | "versions" | "phone" | null>(
    null,
  );
  const [simulation, setSimulation] =
    useState<SimulationInput>(DEFAULT_SIMULATION);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [notice, setNotice] = useState("");
  const [phoneStep, setPhoneStep] = useState(0);
  const [phoneService, setPhoneService] = useState("舒緩護理");
  const [phoneBranch, setPhoneBranch] = useState("中環示範店");
  const graph = useRef<ReactFlowInstance<CanvasNode>>(null);
  const flow = state.flows.find((f) => f.id === flowId) ?? state.flows[0];
  const selected = flow.nodes.find((n) => n.id === selectedId);
  const issues = validateFlow(flow);
  const versions = state.versions.filter((v) => v.flow.id === flow.id);
  const nodes: CanvasNode[] = useMemo(
    () =>
      flow.nodes.map((n) => ({
        id: n.id,
        type: "business",
        position: n.position,
        data: {
          node: n,
          step: result?.steps.find((s) => s.nodeId === n.id)?.state,
        },
        selected: selectedId === n.id,
        ariaLabel: `${n.title}，${NODE_META[n.kind].title}`,
        width: 212,
      })),
    [flow.nodes, result, selectedId],
  );
  const edges = useMemo(
    () =>
      flow.edges.map((e) => ({
        ...e,
        sourceHandle: e.sourceHandle,
        type: "smoothstep",
        label: e.sourceHandle ? branchLabels[e.sourceHandle] : undefined,
        animated: !!result?.steps.some(
          (s) => s.nodeId === e.source && s.state === "completed",
        ),
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: {
          stroke: result?.steps.some(
            (s) => s.nodeId === e.source && s.state === "completed",
          )
            ? "#8a78d0"
            : "#c8c8dc",
          strokeWidth: 1.4,
        },
        labelStyle: { fontSize: 10, fill: "#777189" },
        labelBgStyle: { fill: "#fcfbff" },
      })),
    [flow.edges, result],
  );
  function update(next: Flow) {
    dispatch({ type: "flow", flow: { ...next, updatedAt: actionTime() } });
    setResult(null);
  }
  function patchNode(patch: Partial<FlowNode>) {
    if (selected)
      update({
        ...flow,
        nodes: flow.nodes.map((n) =>
          n.id === selected.id ? { ...n, ...patch } : n,
        ),
      });
  }
  function connect(
    connection: Pick<Connection, "source" | "target" | "sourceHandle">,
  ) {
    if (
      !connection.source ||
      !connection.target ||
      connection.source === connection.target
    )
      return;
    const edge = {
      id: uid(),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? null,
    };
    const next = {
      ...flow,
      edges: [
        ...flow.edges.filter(
          (e) =>
            !(e.source === edge.source && e.sourceHandle === edge.sourceHandle),
        ),
        edge,
      ],
    };
    if (validateFlow(next).some((i) => i.includes("循環"))) {
      setNotice("呢條連線會形成循環，請選擇其他下一步。");
      return;
    }
    update(next);
  }
  function changeNodes(changes: NodeChange<CanvasNode>[]) {
    const relevant = changes.filter((c) => c.type === "position");
    if (!relevant.length) return;
    const moved = applyNodeChanges(relevant, nodes);
    update({
      ...flow,
      nodes: flow.nodes.map((n) => ({
        ...n,
        position: moved.find((m) => m.id === n.id)?.position ?? n.position,
      })),
    });
  }
  function addNode(kind: Kind) {
    const n = makeNode(kind, uid(), 250, 260 + flow.nodes.length * 30);
    update({ ...flow, nodes: [...flow.nodes, n] });
    setSelectedId(n.id);
    setLibrary(false);
    setNotice("節點已加入，請設定連線。");
  }
  function arrange() {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 60 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of flow.nodes)
      g.setNode(n.id, { width: 212, height: n.kind === "intent" ? 120 : 100 });
    for (const e of flow.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);
    update({
      ...flow,
      nodes: flow.nodes.map((n) => ({
        ...n,
        position: { x: g.node(n.id).x - 106, y: g.node(n.id).y - 50 },
      })),
    });
    requestAnimationFrame(() =>
      graph.current?.fitView({ padding: 0.15, duration: 250 }),
    );
  }
  function addFlow() {
    const id = uid();
    dispatch({
      type: "add-flow",
      flow: {
        ...structuredClone(state.flows[0]),
        id,
        name: `新客戶接待流程 ${state.flows.length + 1}`,
        revision: 1,
        updatedAt: actionTime(),
      },
    });
    setFlowId(id);
    setResult(null);
    setSelectedId("intent");
  }
  function switchFlow(id: string) {
    setFlowId(id);
    setSelectedId("");
    setResult(null);
  }
  const nextHandles =
    selected?.kind === "intent"
      ? ["faq", "booking", "handoff"]
      : selected?.kind === "condition"
        ? ["new", "existing"]
        : selected &&
            !["answer", "reminder", "handoff", "end"].includes(selected.kind)
          ? [null]
          : [];

  return (
    <section
      className="st-workspace st-flow-workspace"
      aria-label="Flow Studio"
    >
      <header className="st-page-header">
        <div className="st-page-heading">
          <span className="st-page-icon">
            <Workflow size={23} />
          </span>
          <div>
            <h1>
              Flow Studio<span>流程設計工作室</span>
            </h1>
            <p>將每個查詢，接到清楚嘅下一步。</p>
          </div>
        </div>
        <div className="st-header-actions">
          <StudioStatus />
          <button
            className="st-button st-mobile-library"
            onClick={() => setLibrary(!library)}
          >
            <LayoutGrid size={15} />
            節點
          </button>
          <button className="st-button" onClick={() => setModal("versions")}>
            <History size={15} />
            <span>版本紀錄</span>
          </button>
          <button
            className="st-button st-primary"
            onClick={() => {
              setResult(null);
              setModal("simulate");
            }}
          >
            <Play size={15} />
            試跑流程
          </button>
        </div>
      </header>
      <aside className={`st-flow-library ${library ? "is-open" : ""}`}>
        <div className="st-library-title">
          <h2>我的流程</h2>
          <button
            aria-label="新增流程"
            disabled={state.flows.length >= 12}
            onClick={addFlow}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="st-flow-list">
          {state.flows.map((f) => (
            <button
              key={f.id}
              className={f.id === flow.id ? "is-active" : ""}
              onClick={() => {
                switchFlow(f.id);
                setLibrary(false);
              }}
            >
              <GitBranch size={15} />
              <span>
                {f.name}
                <small>草稿 · v{f.revision}</small>
              </span>
              {f.id === flow.id && <span className="st-small-dot" />}
            </button>
          ))}
        </div>
        <div className="st-library-divider" />
        <div className="st-library-title">
          <h2>加入節點</h2>
          <span>{kinds.length}</span>
        </div>
        <label className="st-search">
          <Search size={14} />
          <input
            aria-label="搜尋流程節點"
            placeholder="搜尋節點"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="st-node-library">
          {kinds
            .filter((k) =>
              (NODE_META[k].title + NODE_META[k].description).includes(search),
            )
            .map((kind) => (
              <button
                key={kind}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/followhub-node", kind);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => addNode(kind)}
              >
                <NodeGlyph kind={kind} />
                <span>
                  {NODE_META[kind].title}
                  <small>{NODE_META[kind].description}</small>
                </span>
                <Plus size={12} />
              </button>
            ))}
        </div>
        <footer>
          <ShieldCheck size={13} />
          <span>
            流程只用 CRM 跟進資料
            <br />
            名額及正式安排由同事核實
          </span>
        </footer>
      </aside>
      <div className="st-canvas-column">
        <div className="st-canvas-toolbar">
          <div>
            <strong>{flow.name}</strong>
            <span className="st-draft-chip">草稿 v{flow.revision}</span>
          </div>
          <div>
            <button className="st-text-button" onClick={arrange}>
              <LayoutGrid size={13} />
              自動排版
            </button>
            <button
              className="st-text-button"
              onClick={() => {
                setPhoneStep(0);
                setModal("phone");
              }}
            >
              <Smartphone size={14} />
              表單預覽
            </button>
            <button
              className="st-button st-save-button"
              disabled={issues.length > 0}
              onClick={() => {
                dispatch({
                  type: "save-version",
                  flowId: flow.id,
                  at: actionTime(),
                  id: uid(),
                });
                setNotice("示範版本已儲存，真實流程未啟用。");
              }}
            >
              <Save size={13} />
              儲存版本
            </button>
          </div>
        </div>
        <div
          className="st-canvas"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const kind = e.dataTransfer.getData(
              "application/followhub-node",
            ) as Kind;
            if (!kinds.includes(kind)) return;
            const position = graph.current?.screenToFlowPosition({
              x: e.clientX,
              y: e.clientY,
            }) ?? { x: 250, y: 250 };
            const n = makeNode(kind, uid(), position.x, position.y);
            update({ ...flow, nodes: [...flow.nodes, n] });
            setSelectedId(n.id);
          }}
        >
          <ReactFlow<CanvasNode>
            key={flow.id}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              graph.current = instance;
            }}
            onNodesChange={changeNodes}
            onConnect={connect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId("")}
            onEdgesDelete={(deleted) =>
              update({
                ...flow,
                edges: flow.edges.filter(
                  (e) => !deleted.some((d) => d.id === e.id),
                ),
              })
            }
            fitView
            fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
            minZoom={0.35}
            maxZoom={1.6}
            deleteKeyCode={null}
            ariaLabelConfig={{
              "controls.zoomIn.ariaLabel": "放大畫布",
              "controls.zoomOut.ariaLabel": "縮小畫布",
              "controls.fitView.ariaLabel": "顯示完整流程",
              "controls.interactive.ariaLabel": "切換畫布鎖定",
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#dddbea"
            />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor="#d6cbee"
              maskColor="rgba(248,247,252,.7)"
              ariaLabel="流程縮圖"
            />
          </ReactFlow>
          <span className="st-canvas-hint">
            <span className="st-small-dot" />
            {flow.nodes.length} 個節點 · {flow.edges.length} 條連線
            <span>拖拉節點調整位置</span>
          </span>
        </div>
        <footer className="st-canvas-footer">
          <span>
            <ShieldCheck size={12} />
            {issues.length
              ? `${issues.length} 項設定需要處理`
              : "流程結構完整，可以試跑"}
          </span>
          <span>
            {studio.storageError
              ? "本機儲存失敗，請保留此頁面"
              : "變更自動保留於此瀏覽器"}
          </span>
        </footer>
      </div>
      <aside
        className={`st-inspector ${selected ? "has-selection" : ""}`}
        aria-label="節點設定"
      >
        <header>
          <h2>{selected ? "節點設定" : "流程設定"}</h2>
          {selected && (
            <button aria-label="關閉節點設定" onClick={() => setSelectedId("")}>
              <X size={15} />
            </button>
          )}
        </header>
        <div className="st-inspector-scroll">
          {selected ? (
            <>
              <div className="st-inspector-node">
                <NodeGlyph kind={selected.kind} size={20} />
                <div>
                  <strong>{NODE_META[selected.kind].title}</strong>
                  <small>
                    {selected.id === "intent"
                      ? "將查詢接到合適嘅下一步"
                      : NODE_META[selected.kind].description}
                  </small>
                </div>
              </div>
              <div className="st-fields">
                <label>
                  節點名稱
                  <input
                    aria-label="節點名稱"
                    maxLength={60}
                    value={selected.title}
                    onChange={(e) => {
                      if (e.target.value.trim())
                        patchNode({ title: e.target.value });
                    }}
                  />
                </label>
                <label>
                  說明
                  <textarea
                    aria-label="節點說明"
                    rows={2}
                    maxLength={200}
                    value={selected.description}
                    onChange={(e) => patchNode({ description: e.target.value })}
                  />
                </label>
                {selected.kind === "reminder" && (
                  <>
                    <label>
                      提醒時間
                      <select
                        aria-label="提醒時間"
                        value={selected.config.reminderHour}
                        onChange={(e) =>
                          patchNode({
                            config: {
                              ...selected.config,
                              reminderHour: Number(e.target.value),
                            },
                          })
                        }
                      >
                        {[9, 10, 12, 15, 18].map((h) => (
                          <option key={h} value={h}>
                            前一日 {h}:00（香港時間）
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      範本內容
                      <textarea
                        aria-label="提醒範本內容"
                        rows={6}
                        maxLength={2000}
                        value={selected.config.template}
                        onChange={(e) =>
                          patchNode({
                            config: {
                              ...selected.config,
                              template: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <div className="st-field-subheading">變數配對</div>
                    {[
                      ...new Set(
                        [
                          ...selected.config.template.matchAll(
                            /\{\{(\w+)\}\}/g,
                          ),
                        ].map((m) => m[1]),
                      ),
                    ].map((p) => (
                      <label className="st-binding" key={p}>
                        <code>{`{{${p}}}`}</code>
                        <select
                          aria-label={`配對 ${p}`}
                          value={
                            selected.config.bindings.find(
                              (b) => b.placeholder === p,
                            )?.field ?? ""
                          }
                          onChange={(e) =>
                            patchNode({
                              config: {
                                ...selected.config,
                                bindings: [
                                  ...selected.config.bindings.filter(
                                    (b) => b.placeholder !== p,
                                  ),
                                  {
                                    placeholder: p,
                                    field: e.target.value as "name",
                                  },
                                ],
                              },
                            })
                          }
                        >
                          <option value="" disabled>
                            選擇欄位
                          </option>
                          {[
                            { v: "name", l: "客戶稱呼" },
                            { v: "service", l: "預約療程" },
                            { v: "fee", l: "已核實費用安排" },
                            { v: "date", l: "預約日期" },
                            { v: "time", l: "預約時間" },
                            { v: "branch", l: "預約分店" },
                          ].map((o) => (
                            <option key={o.v} value={o.v}>
                              {o.l}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </>
                )}
                {selected.kind === "message" && (
                  <label>
                    回覆內容
                    <textarea
                      aria-label="固定回覆內容"
                      rows={5}
                      value={selected.config.message}
                      maxLength={2000}
                      onChange={(e) =>
                        patchNode({
                          config: {
                            ...selected.config,
                            message: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                )}
                {selected.kind === "delay" && (
                  <label>
                    等待小時
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={selected.config.waitHours}
                      onChange={(e) =>
                        patchNode({
                          config: {
                            ...selected.config,
                            waitHours: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                )}
                {selected.kind === "handoff" && (
                  <label>
                    分配同事
                    <select
                      aria-label="流程交接同事"
                      value={selected.config.owner}
                      onChange={(e) =>
                        patchNode({
                          config: {
                            ...selected.config,
                            owner: e.target.value as "iris",
                          },
                        })
                      }
                    >
                      <option value="iris">Iris Chan</option>
                      <option value="me">Mia（我）</option>
                      <option value="ken">Ken Wong</option>
                    </select>
                  </label>
                )}
                {selected.kind === "form" && (
                  <div className="st-rule-box">
                    <ListChecks size={16} />
                    <p>
                      表單只收集預約意向：服務、分店、日期時間。提交後建立跟進卡，等候
                      CS 核實。
                    </p>
                    <button
                      onClick={() => {
                        setPhoneStep(0);
                        setModal("phone");
                      }}
                    >
                      預覽客戶畫面
                      <ArrowRight size={12} />
                    </button>
                  </div>
                )}
                {selected.kind === "review" && (
                  <div className="st-rule-box">
                    <ShieldCheck size={16} />
                    <p>
                      同事核實之前，流程會停喺呢一步。已接受嘅時間並不等於名額已確認。
                    </p>
                  </div>
                )}
                {selected.kind === "answer" && (
                  <div className="st-rule-box">
                    <ShieldCheck size={16} />
                    <p>
                      引用有效嘅品牌知識；資料不足、投訴或需要專業核實嘅問題，會轉交同事。
                    </p>
                  </div>
                )}
                {nextHandles.length > 0 && (
                  <>
                    <div className="st-field-subheading">下一步連線</div>
                    {nextHandles.map((handle, i) => (
                      <label key={handle ?? i}>
                        {handle ? branchLabels[handle] : "完成後"}
                        <select
                          aria-label={`下一步 ${handle ? branchLabels[handle] : "完成後"}`}
                          value={
                            flow.edges.find(
                              (e) =>
                                e.source === selected.id &&
                                e.sourceHandle === handle,
                            )?.target ?? ""
                          }
                          onChange={(e) => {
                            if (e.target.value)
                              connect({
                                source: selected.id,
                                target: e.target.value,
                                sourceHandle: handle,
                              });
                            else
                              update({
                                ...flow,
                                edges: flow.edges.filter(
                                  (edge) =>
                                    !(
                                      edge.source === selected.id &&
                                      edge.sourceHandle === handle
                                    ),
                                ),
                              });
                          }}
                        >
                          <option value="">尚未連接</option>
                          {flow.nodes
                            .filter(
                              (n) =>
                                n.id !== selected.id && n.kind !== "trigger",
                            )
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    ))}
                  </>
                )}
                {selected.kind !== "trigger" && (
                  <button
                    className="st-delete-button"
                    onClick={() => {
                      update({
                        ...flow,
                        nodes: flow.nodes.filter((n) => n.id !== selected.id),
                        edges: flow.edges.filter(
                          (e) =>
                            e.source !== selected.id &&
                            e.target !== selected.id,
                        ),
                      });
                      setSelectedId("");
                    }}
                  >
                    <Trash2 size={13} />
                    移除此節點
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="st-fields">
              <label>
                流程名稱
                <input
                  aria-label="流程名稱"
                  value={flow.name}
                  maxLength={80}
                  onChange={(e) => {
                    if (e.target.value.trim())
                      update({ ...flow, name: e.target.value });
                  }}
                />
              </label>
              <label>
                適用品牌
                <select
                  aria-label="流程適用品牌"
                  value={flow.brandId}
                  onChange={(e) =>
                    update({
                      ...flow,
                      brandId: e.target.value as Flow["brandId"],
                    })
                  }
                >
                  {BRANDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                流程說明
                <textarea
                  rows={3}
                  value={flow.description}
                  maxLength={200}
                  onChange={(e) =>
                    update({ ...flow, description: e.target.value })
                  }
                />
              </label>
              <div className="st-rule-box">
                <Workflow size={18} />
                <p>從左邊加入節點，點選節點編輯，再用試跑檢查每條路徑。</p>
              </div>
            </div>
          )}
          {issues.length > 0 && (
            <div className="st-validation" role="status">
              <strong>需要處理</strong>
              {issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          )}
        </div>
        <footer>
          <span className="st-neutral-chip">獨立預約跟進</span>
          <p>不查即時名額・不改 POS 資料</p>
        </footer>
      </aside>
      {notice && (
        <div className="st-notice" role="status">
          <Check size={14} />
          {notice}
          <button aria-label="關閉流程提示" onClick={() => setNotice("")}>
            <X size={13} />
          </button>
        </div>
      )}
      {modal === "simulate" && (
        <Modal
          title="試跑流程"
          subtitle="用虛構資料走一次，檢查每一步同範本變數。"
          wide
          onClose={() => setModal(null)}
        >
          <div className="st-simulation">
            <div className="st-sim-inputs">
              <label>
                客戶意圖
                <select
                  aria-label="試跑客戶意圖"
                  value={simulation.intent}
                  onChange={(e) =>
                    setSimulation({
                      ...simulation,
                      intent: e.target.value as SimulationInput["intent"],
                    })
                  }
                >
                  <option value="booking">預約意向</option>
                  <option value="faq">一般查詢</option>
                  <option value="handoff">需要真人協助</option>
                </select>
              </label>
              <label>
                客戶類型
                <select
                  aria-label="試跑客戶類型"
                  value={simulation.customerType}
                  onChange={(e) =>
                    setSimulation({
                      ...simulation,
                      customerType: e.target.value as "new",
                    })
                  }
                >
                  <option value="new">新客</option>
                  <option value="existing">現有客戶</option>
                </select>
              </label>
            </div>
            <div className="st-sim-checks">
              {[
                { key: "manualVerified", text: "假設同事已核實預約" },
                { key: "consent", text: "假設客戶同意接收通知" },
                { key: "templateApproved", text: "假設提醒範本可用" },
                { key: "withinWindow", text: "仍在客服回覆窗口內" },
              ].map((o) => (
                <label key={o.key}>
                  <input
                    type="checkbox"
                    checked={simulation[o.key as "manualVerified"]}
                    onChange={(e) =>
                      setSimulation({
                        ...simulation,
                        [o.key]: e.target.checked,
                      })
                    }
                  />
                  {o.text}
                </label>
              ))}
            </div>
            <details className="st-sim-data">
              <summary>
                範本測試資料
                <ChevronDown size={13} />
              </summary>
              <div className="st-sim-inputs">
                {[
                  { key: "name", text: "客戶稱呼" },
                  { key: "service", text: "療程" },
                  { key: "date", text: "日期" },
                  { key: "time", text: "時間" },
                  { key: "branch", text: "分店" },
                  { key: "fee", text: "費用安排" },
                ].map((o) => (
                  <label key={o.key}>
                    {o.text}
                    <input
                      aria-label={`測試資料 ${o.text}`}
                      maxLength={100}
                      value={simulation.fields[o.key as "name"]}
                      onChange={(e) =>
                        setSimulation({
                          ...simulation,
                          fields: {
                            ...simulation.fields,
                            [o.key]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </details>
            <button
              className="st-button st-primary st-full"
              onClick={() => setResult(simulateFlow(flow, simulation))}
            >
              <Play size={14} />
              開始試跑
            </button>
            {result && (
              <div className="st-trace" aria-live="polite">
                <header>
                  <strong>{result.outcome}</strong>
                  <span>{result.steps.length} 個步驟</span>
                </header>
                {result.issues.map((i) => (
                  <p className="st-validation" key={i}>
                    {i}
                  </p>
                ))}
                {result.steps.map((s, i) => (
                  <article key={s.nodeId} className={`st-trace-${s.state}`}>
                    <span>
                      {s.state === "completed" ? (
                        <Check size={13} />
                      ) : (
                        <Clock3 size={13} />
                      )}
                    </span>
                    <div>
                      <h3>
                        {String(i + 1).padStart(2, "0")} · {s.title}
                      </h3>
                      <p>{s.detail}</p>
                      {s.preview && <blockquote>{s.preview}</blockquote>}
                    </div>
                  </article>
                ))}
                {result.followup && (
                  <div className="st-followup-preview">
                    <ListChecks size={19} />
                    <div>
                      <strong>預約跟進卡 · 示範</strong>
                      <p>
                        {simulation.fields.name} · {simulation.fields.service}
                      </p>
                      <span>
                        {simulation.fields.date} {simulation.fields.time} ·{" "}
                        {simulation.fields.branch}
                      </span>
                      <small>
                        {simulation.manualVerified
                          ? "同事已核實（測試條件）"
                          : "待 CS 核實"}
                      </small>
                    </div>
                  </div>
                )}
                <button
                  className="st-text-button"
                  onClick={() => setModal(null)}
                >
                  返回畫布查看執行路徑
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
            <p className="st-small-note">
              只模擬流程及資料配對，不會向客戶發送訊息或建立真實排程。
            </p>
          </div>
        </Modal>
      )}
      {modal === "versions" && (
        <Modal
          title="示範版本紀錄"
          subtitle="儲存或還原設計，並不會啟用真實發送。"
          onClose={() => setModal(null)}
        >
          <div className="st-version-list">
            {versions.length ? (
              versions.map((v) => (
                <article key={v.id}>
                  <span>
                    <History size={18} />
                  </span>
                  <div>
                    <strong>
                      版本 {v.flow.revision} · {v.flow.name}
                    </strong>
                    <p>
                      {new Intl.DateTimeFormat("zh-HK", {
                        timeZone: "Asia/Hong_Kong",
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(v.savedAt)}
                    </p>
                    <small>
                      {v.flow.nodes.length} 個節點 · {v.flow.edges.length}{" "}
                      條連線
                    </small>
                  </div>
                  <button
                    className="st-button"
                    onClick={() => {
                      dispatch({
                        type: "restore-version",
                        versionId: v.id,
                        at: actionTime(),
                      });
                      setSelectedId("");
                      setResult(null);
                      setModal(null);
                      setNotice("版本已還原到目前草稿。");
                    }}
                  >
                    <RotateCcw size={13} />
                    還原
                  </button>
                </article>
              ))
            ) : (
              <div className="st-empty">
                <History size={28} />
                <strong>未有已儲存版本</strong>
                <p>完成設計後，按畫布上方「儲存版本」。</p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {modal === "phone" && (
        <Modal
          title="WhatsApp 表單設計預覽"
          subtitle="示範收集預約意向，尚未發佈至 Meta。"
          onClose={() => setModal(null)}
        >
          <div className="st-phone-wrap">
            <div className="st-phone">
              <header>
                <ArrowLeft size={16} />
                <strong>
                  {BRANDS.find((b) => b.id === flow.brandId)?.name}
                </strong>
                <span>預約意向</span>
              </header>
              <div className="st-phone-body">
                {phoneStep === 0 ? (
                  <>
                    <span className="st-phone-kicker">預約查詢 · 1 / 2</span>
                    <h3>想了解邊項服務？</h3>
                    <p>留下你嘅選擇，我哋會安排同事核實。</p>
                    <label>
                      服務
                      <select
                        value={phoneService}
                        onChange={(e) => setPhoneService(e.target.value)}
                      >
                        <option>舒緩護理</option>
                        <option>雙人同行護理</option>
                        <option>想先了解服務</option>
                      </select>
                    </label>
                    <label>
                      心儀分店
                      <select
                        value={phoneBranch}
                        onChange={(e) => setPhoneBranch(e.target.value)}
                      >
                        <option>中環示範店</option>
                        <option>九龍示範店</option>
                      </select>
                    </label>
                    <button onClick={() => setPhoneStep(1)}>
                      下一步
                      <ArrowRight size={15} />
                    </button>
                  </>
                ) : phoneStep === 1 ? (
                  <>
                    <span className="st-phone-kicker">預約查詢 · 2 / 2</span>
                    <h3>幾時方便過嚟？</h3>
                    <p>呢個係心儀時間，同事核實後會再確認。</p>
                    <label>
                      心儀日期
                      <input
                        type="date"
                        value={simulation.fields.date}
                        onChange={(e) =>
                          setSimulation({
                            ...simulation,
                            fields: {
                              ...simulation.fields,
                              date: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      心儀時間
                      <input
                        type="time"
                        value={simulation.fields.time}
                        onChange={(e) =>
                          setSimulation({
                            ...simulation,
                            fields: {
                              ...simulation.fields,
                              time: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <button
                      disabled={
                        !simulation.fields.date || !simulation.fields.time
                      }
                      onClick={() => setPhoneStep(2)}
                    >
                      提交預約意向
                      <Check size={15} />
                    </button>
                    <button
                      className="st-phone-back"
                      onClick={() => setPhoneStep(0)}
                    >
                      返回上一步
                    </button>
                  </>
                ) : (
                  <div className="st-phone-success">
                    <span>
                      <Check size={26} />
                    </span>
                    <h3>已收到你嘅預約意向</h3>
                    <p>
                      {phoneService}
                      <br />
                      {phoneBranch}
                      <br />
                      {simulation.fields.date} {simulation.fields.time}
                    </p>
                    <strong>等待同事核實後確認</strong>
                    <p>我哋會喺對話內聯絡你。</p>
                    <button
                      onClick={() => {
                        setModal(null);
                        onInbox();
                      }}
                    >
                      返回對話工作台
                    </button>
                  </div>
                )}
              </div>
              <footer>
                <ShieldCheck size={10} />
                此畫面為互動示範
              </footer>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
