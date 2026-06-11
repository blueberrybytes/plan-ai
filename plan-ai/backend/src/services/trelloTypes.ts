export interface TrelloManualConnectRequest {
  apiKey: string;
  token: string;
}

export interface TrelloSummaryResponse {
  totalBoards: number;
  latestBoards: string[];
}

export interface TrelloBoardItem {
  id: string;
  name: string;
}

export interface TrelloListItem {
  id: string;
  name: string;
}

export interface SetDefaultTrelloBoardListRequest {
  boardId: string;
  listId: string;
}
