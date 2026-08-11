import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, getUsers, updateUser } from "../api/users";
import type { UserCreatePayload, UserUpdatePayload } from "../types/auth";

export const usersQueryKey = ["users"] as const;

export function useUsers() {
  return useQuery({ queryKey: usersQueryKey, queryFn: getUsers });
}

export function useCreateUser() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (payload: UserCreatePayload) => createUser(payload), onSuccess: () => client.invalidateQueries({ queryKey: usersQueryKey }) });
}

export function useUpdateUser() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: UserUpdatePayload }) => updateUser(id, payload), onSuccess: () => client.invalidateQueries({ queryKey: usersQueryKey }) });
}
