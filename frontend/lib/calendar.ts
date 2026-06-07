import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { MealPlan } from "@/lib/types";

export interface CalendarWeekDoc {
  plan_id: string;
  plan_name: string | null;
  week_start: string;
  scheduled_week: string;
  diet_type: string;
  updated_at: string;
}

export function calendarWeekDocId(scheduledWeek: string): string {
  return scheduledWeek;
}

export async function syncPlanToCalendar(
  uid: string,
  plan: MealPlan,
  scheduledWeek: string
): Promise<void> {
  const ref = doc(db, "calendars", uid, "weeks", calendarWeekDocId(scheduledWeek));
  const payload: CalendarWeekDoc = {
    plan_id: plan.id,
    plan_name: plan.name,
    week_start: plan.week_start,
    scheduled_week: scheduledWeek,
    diet_type: plan.diet_type,
    updated_at: new Date().toISOString(),
  };
  await setDoc(ref, payload, { merge: true });
}

export function subscribeToCalendarWeeks(
  uid: string,
  onUpdate: (weeks: Record<string, CalendarWeekDoc>) => void
): Unsubscribe {
  const weeksRef = collection(db, "calendars", uid, "weeks");
  return onSnapshot(weeksRef, (snap) => {
    const map: Record<string, CalendarWeekDoc> = {};
    snap.forEach((d) => {
      map[d.id] = d.data() as CalendarWeekDoc;
    });
    onUpdate(map);
  });
}
