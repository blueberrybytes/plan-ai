import { createApi } from "@reduxjs/toolkit/query/react";
import type { components, operations } from "../../types/api";
import { baseQueryWithReauth } from "../../utils/baseQuery";

export type Note = components["schemas"]["NoteResponse"];
export type NoteList = components["schemas"]["NoteListResponse"];
export type CreateNoteRequest = components["schemas"]["CreateNoteRequest"];
export type UpdateNoteRequest = components["schemas"]["UpdateNoteRequest"];
export type NotePeriod = components["schemas"]["NotePeriodValue"];
export type ListNotesParams = NonNullable<operations["ListNotes"]["parameters"]["query"]>;

/** The `scope` values the list endpoint accepts. */
export type NoteScope = "all" | "inbox" | "pinned" | "mine" | "shared" | "trash";

/** Fields whose change can move a note in or out of a filtered list. */
const LIST_SHAPING_FIELDS: (keyof UpdateNoteRequest)[] = [
  "pinned",
  "visibility",
  "projectId",
  "transcriptId",
];

const changesListShape = (patch: UpdateNoteRequest) =>
  LIST_SHAPING_FIELDS.some((field) => patch[field] !== undefined);

export const notesApi = createApi({
  reducerPath: "notesApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Note"],
  endpoints: (builder) => ({
    listNotes: builder.query<NoteList, ListNotesParams>({
      query: (params) => ({ url: "/api/notes", method: "GET", params }),
      providesTags: (result) => [
        { type: "Note" as const, id: "LIST" },
        ...(result?.notes ?? []).map((note) => ({ type: "Note" as const, id: note.id })),
      ],
    }),

    getNote: builder.query<Note, string>({
      query: (id) => `/api/notes/${encodeURIComponent(id)}`,
      providesTags: (_result, _error, id) => [{ type: "Note", id }],
    }),

    /** The daily or weekly note for a local date. The server creates it the first time. */
    getPeriodNote: builder.query<Note, { period: NotePeriod; date: string }>({
      query: ({ period, date }) => `/api/notes/period/${period}/${date}`,
      async onQueryStarted(_args, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(notesApi.util.upsertQueryData("getNote", data.id, data));
        } catch {
          // The caller shows the error.
        }
      },
    }),

    createNote: builder.mutation<Note, CreateNoteRequest>({
      query: (body) => ({ url: "/api/notes", method: "POST", body }),
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          // The editor reads the note from this cache entry, so it must be
          // there before the list refetch finishes.
          dispatch(notesApi.util.upsertQueryData("getNote", data.id, data));
        } catch {
          // The caller handles the error.
        }
      },
      invalidatesTags: [{ type: "Note", id: "LIST" }],
    }),

    updateNote: builder.mutation<Note, { id: string; patch: UpdateNoteRequest }>({
      query: ({ id, patch }) => ({
        url: `/api/notes/${encodeURIComponent(id)}`,
        method: "PATCH",
        body: patch,
      }),
      async onQueryStarted({ id, patch }, { dispatch, getState, queryFulfilled }) {
        const listArgs = notesApi.util.selectCachedArgsForQuery(getState(), "listNotes");
        // The pin toggle shows at once. Text edits are not copied here: the
        // editor already shows them.
        const optimistic =
          patch.pinned !== undefined
            ? [
                dispatch(
                  notesApi.util.updateQueryData("getNote", id, (draft) => {
                    draft.pinned = patch.pinned as boolean;
                  }),
                ),
                ...listArgs.map((args) =>
                  dispatch(
                    notesApi.util.updateQueryData("listNotes", args, (draft) => {
                      const note = draft.notes.find((n) => n.id === id);
                      if (note) note.pinned = patch.pinned as boolean;
                    }),
                  ),
                ),
              ]
            : [];
        try {
          const { data } = await queryFulfilled;
          // Keep the server copy (with its new version) in every cache entry.
          dispatch(notesApi.util.upsertQueryData("getNote", id, data));
          for (const args of listArgs) {
            dispatch(
              notesApi.util.updateQueryData("listNotes", args, (draft) => {
                const index = draft.notes.findIndex((n) => n.id === id);
                if (index >= 0) draft.notes[index] = data;
              }),
            );
          }
        } catch {
          optimistic.forEach((patchResult) => patchResult.undo());
        }
      },
      // Text edits only patch the caches above. A change that can move the
      // note between lists (pin, share, project) refetches the lists.
      invalidatesTags: (_result, error, { patch }) =>
        !error && changesListShape(patch) ? [{ type: "Note", id: "LIST" }] : [],
    }),

    /** Moves a note to the trash (kept 30 days). */
    trashNote: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/api/notes/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Note", id },
        { type: "Note", id: "LIST" },
      ],
    }),

    restoreNote: builder.mutation<Note, string>({
      query: (id) => ({ url: `/api/notes/${encodeURIComponent(id)}/restore`, method: "POST" }),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          // Restoring bumps the version. The editor reopens on this copy.
          dispatch(notesApi.util.upsertQueryData("getNote", id, data));
        } catch {
          // The caller shows the error.
        }
      },
      invalidatesTags: [{ type: "Note", id: "LIST" }],
    }),

    /** Deletes a note in the trash for good. */
    purgeNote: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/api/notes/${encodeURIComponent(id)}/permanent`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Note", id: "LIST" }],
    }),
  }),
});

export const {
  useListNotesQuery,
  useGetNoteQuery,
  useLazyGetNoteQuery,
  useLazyGetPeriodNoteQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useTrashNoteMutation,
  useRestoreNoteMutation,
  usePurgeNoteMutation,
} = notesApi;
