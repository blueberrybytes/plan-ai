export type GenericResponse = {
  status: number;
  message: string;
};

export type ApiResponse<T> = {
  status: number;
  data: T | null;
  message?: string;
};

export type ErrorResponse = {
  message: string;
  status: number;
};
