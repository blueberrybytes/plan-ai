import React from "react";
import { Box, Chip, Link, Stack, Typography } from "@mui/material";
import { CalendarMonthOutlined as CalendarIcon } from "@mui/icons-material";

interface Invite {
  title?: string;
  start?: string;
  end?: string;
  attendees?: { name?: string; email: string }[];
  meetingUrl?: string;
}

const inviteOf = (metadata: unknown): Invite | null => {
  const event = (metadata as { calendarEvent?: Invite } | null)?.calendarEvent;
  return event && typeof event === "object" && event.title ? event : null;
};

const clock = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/**
 * The calendar event the meeting was recorded from: its title, time, the
 * people invited and the call link. Shown only when there was one.
 */
const CalendarInviteInfo: React.FC<{ metadata: unknown }> = ({ metadata }) => {
  const invite = inviteOf(metadata);
  if (!invite) return null;
  const attendees = invite.attendees ?? [];
  const time =
    invite.start && invite.end
      ? `${clock(invite.start)} - ${clock(invite.end)}`
      : "";

  return (
    <Box
      sx={{
        mt: 1,
        mb: 2,
        p: 1.5,
        borderRadius: 1,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <CalendarIcon fontSize="small" color="primary" />
        <Typography variant="body2">
          Calendar invite: <strong>{invite.title}</strong>
          {time ? ` · ${time}` : ""}
        </Typography>
        {invite.meetingUrl?.startsWith("https://") && (
          <Link
            component="button"
            variant="body2"
            onClick={() => void window.electron.openExternalUrl(invite.meetingUrl!)}
          >
            Call link
          </Link>
        )}
      </Stack>
      <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={0.75}>
        <Typography variant="caption" color="text.secondary">
          Invited ({attendees.length}):
        </Typography>
        {attendees.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            nobody else
          </Typography>
        ) : (
          attendees.map((a) => (
            <Chip
              key={a.email}
              size="small"
              variant="outlined"
              label={a.name ? `${a.name} (${a.email})` : a.email}
            />
          ))
        )}
      </Stack>
    </Box>
  );
};

export default CalendarInviteInfo;
