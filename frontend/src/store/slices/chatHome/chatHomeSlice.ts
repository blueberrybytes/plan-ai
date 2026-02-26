import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface ChatHomeState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
}

const initialState: ChatHomeState = {
  messages: [],
};

const chatHomeSlice = createSlice({
  name: "chatHome",
  initialState,
  reducers: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setChatHomeMessages: (state, action: PayloadAction<any[]>) => {
      console.log("[Redux] setChatHomeMessages payload length:", action.payload?.length);
      state.messages = action.payload;
    },
    clearChatHomeMessages: (state) => {
      console.log("[Redux] clearChatHomeMessages");
      state.messages = [];
    },
  },
});

export const { setChatHomeMessages, clearChatHomeMessages } = chatHomeSlice.actions;

export default chatHomeSlice.reducer;
