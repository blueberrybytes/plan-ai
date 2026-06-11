import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type DefaultProjectView = "board" | "canvas" | "timeline" | "diagram";

interface PreferencesState {
  defaultProjectView: DefaultProjectView;
}

const initialState: PreferencesState = {
  defaultProjectView: "board",
};

const preferencesSlice = createSlice({
  name: "preferences",
  initialState,
  reducers: {
    setDefaultProjectView(state, action: PayloadAction<DefaultProjectView>) {
      state.defaultProjectView = action.payload;
    },
  },
});

export const { setDefaultProjectView } = preferencesSlice.actions;
export default preferencesSlice.reducer;
