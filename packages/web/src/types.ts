export type User = {
  id: string;
  email: string;
  name: string;
};

export type Board = {
  id: string;
  title: string;
  ownerId: string;
  collaboratorIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type List = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type Card = {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  description: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};
