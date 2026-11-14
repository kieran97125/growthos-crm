"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { ReportPage } from "@/lib/reports/model";
export default function ReportChart({ data }: { data: ReportPage["trend"] }) {
  return (
    <div
      className="report-chart"
      role="img"
      aria-label="每日查詢及預約確認趨勢，完整數字見下方表格"
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={data}
          margin={{ top: 15, right: 20, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(s) => s.slice(5)}
            minTickGap={32}
          />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="inquiries"
            name="新查詢"
            stroke="#2e62d5"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="confirmed"
            name="預約確認紀錄"
            stroke="#158078"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
