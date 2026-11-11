"use client";
import "temporal-polyfill/global";
import FullCalendar, { useCalendarController } from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/monarch";
import zhTw from "@fullcalendar/react/locales/zh-tw";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/blue.css";
import { useEffect } from "react";
import { hkDate } from "@/lib/pos/money";
import { usePos, statusLabels } from "./context";
export default function PosCalendar({
  date,
  onDate,
  staff,
  active,
}: {
  date: string;
  onDate: (date: string) => void;
  staff: string;
  active: boolean;
}) {
  const { pos, brand, open, customerName } = usePos();
  const controller = useCalendarController();
  useEffect(() => {
    controller.gotoDate(date);
  }, [date, controller]);
  return (
    <div className="sv-calendar" data-active={active}>
      <FullCalendar
        controller={controller}
        class="sv-fc"
        eventClass="sv-calendar-event"
        buttonClass="sv-fc-button"
        toolbarClass="sv-fc-toolbar"
        toolbarTitleClass="sv-fc-title"
        dayHeaderClass="sv-fc-day-header"
        slotLaneClass="sv-fc-slot"
        plugins={[timeGridPlugin, interactionPlugin, themePlugin]}
        locale={zhTw}
        initialView="timeGridDay"
        initialDate={date}
        timeZone="Asia/Hong_Kong"
        headerToolbar={{
          start: "prev,next today",
          center: "title",
          end: "timeGridDay,timeGridWeek",
        }}
        buttons={{
          today: { text: "今日" },
          timeGridDay: { text: "日" },
          timeGridWeek: { text: "週" },
        }}
        height={660}
        slotMinTime="08:00:00"
        slotMaxTime="23:00:00"
        slotDuration="00:30:00"
        scrollTime="09:00:00"
        allDaySlot={false}
        nowIndicator
        weekends
        editable={false}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        slotHeaderFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        datesSet={(info) => {
          const next = hkDate(info.view.currentStart.getTime());
          if (next !== date) onDate(next);
        }}
        dateClick={(info) =>
          open({ kind: "appointment", start: info.dateStr.slice(0, 16) })
        }
        eventClick={(info) =>
          open({ kind: "appointment-detail", id: info.event.id })
        }
        events={pos.appointments
          .filter(
            (a) =>
              a.brandId === brand &&
              (staff === "all" || a.staffId === staff) &&
              a.status !== "cancelled",
          )
          .map((a) => ({
            id: a.id,
            title: `${customerName(a.contactId)} · ${a.serviceName} · ${statusLabels[a.status]}`,
            start: new Date(a.startsAt).toISOString(),
            end: new Date(a.endsAt).toISOString(),
            color:
              a.status === "pending"
                ? "#fffaeb"
                : ["checked_in", "completed"].includes(a.status)
                  ? "#edf9f3"
                  : "#edf3ff",
            contrastColor:
              a.status === "pending"
                ? "#76550e"
                : ["checked_in", "completed"].includes(a.status)
                  ? "#156044"
                  : "#244da8",
          }))}
      />
    </div>
  );
}
