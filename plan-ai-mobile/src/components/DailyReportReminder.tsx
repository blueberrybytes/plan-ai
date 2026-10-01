import React, { useCallback, useState } from "react";
import { Banner } from "react-native-paper";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { localDateKey, useAccountNotes } from "../services/notesStore";

// Dismissed for the day, per workspace, until the app restarts.
const dismissed = new Set<string>();

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Reminds the member to send the daily report after the workspace's reminder
 * time, on weekdays, while today's day note on the phone is still empty.
 * It shows when the app is opened. A push notification needs a new native
 * build (expo-notifications) and is not part of this.
 */
export function DailyReportReminder() {
  const router = useRouter();
  const { api, user, activeWorkspaceId } = useAuth();
  const notes = useAccountNotes(user?.uid ?? null);
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setTick((t) => t + 1);
      api
        .getDailyReportStatus(activeWorkspaceId)
        .then((s) => {
          if (!cancelled)
            setReminderTime(
              s.enabled && !s.needsConsent ? s.reminderTime : null,
            );
        })
        .catch(() => {
          // Offline or not available: no reminder.
          if (!cancelled) setReminderTime(null);
        });
      return () => {
        cancelled = true;
      };
    }, [api, activeWorkspaceId]),
  );

  const now = new Date();
  const today = localDateKey(now);
  const key = `${activeWorkspaceId}:${today}`;
  const weekday = now.getDay() >= 1 && now.getDay() <= 5;
  const due =
    !!reminderTime &&
    weekday &&
    now.getHours() * 60 + now.getMinutes() >= minutesOf(reminderTime);
  const written = notes.some(
    (n) =>
      n.workspaceId === activeWorkspaceId &&
      n.server?.periodType === "DAY" &&
      n.server.periodStart === today &&
      n.body.trim().length > 0,
  );
  const visible = due && !written && !dismissed.has(key);

  return (
    <Banner
      visible={visible}
      icon="clipboard-text-clock-outline"
      actions={[
        {
          label: "Later",
          onPress: () => {
            dismissed.add(key);
            setTick((t) => t + 1);
          },
        },
        {
          label: "Send it now",
          onPress: () => router.push("/daily-report" as Href),
        },
      ]}
    >
      Time for your daily report. Say in a minute what you did today.
    </Banner>
  );
}
