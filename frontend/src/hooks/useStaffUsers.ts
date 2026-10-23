import { useQuery } from "@tanstack/react-query";
import { getStaffUsersApi } from "@/api/auth";

const STAFF_USERS_QUERY_KEY = ["auth", "staff-users"] as const;

export function useStaffUsers() {
  return useQuery({
    queryKey: STAFF_USERS_QUERY_KEY,
    queryFn: getStaffUsersApi,
    staleTime: 5 * 60 * 1000,
  });
}

export function staffUserSelectOptions(
  users: { username: string }[] | undefined,
): { value: string; label: string }[] {
  return (users ?? []).map((user) => ({
    value: user.username,
    label: user.username,
  }));
}
