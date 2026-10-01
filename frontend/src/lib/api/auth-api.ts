import { sessionEnded, sessionStarted, userUpdated, accessTokenRenewed } from "@/lib/redux/slices/session-slice";
import { api, refreshMutex, renewSession } from "./api";
import type {
  Address,
  AddressInput,
  LoginResponse,
  PublicUser,
  RegisterResponse,
  SessionSummary,
  SetPasswordResponse,
  TwoFactorSetup,
} from "./types";

type Dispatch = (action: unknown) => unknown;

/** If a response started a session, store it. Errors are left to the calling component. */
async function storeSession(dispatch: Dispatch, queryFulfilled: Promise<{ data: unknown }>) {
  try {
    const { data } = await queryFulfilled;
    const result = data as { status?: string; user?: PublicUser; accessToken?: string };
    if (result.status === "authenticated" && result.user && result.accessToken) {
      dispatch(sessionStarted({ user: result.user, accessToken: result.accessToken }));
    }
  } catch {
    // Must be caught here: this is a separate promise chain from the component's `.unwrap()`, and
    // an uncaught rejection becomes a page error for perfectly normal failures (wrong password).
  }
}

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    /** On-load silent sign-in from the cookie. Holds the refresh lock itself (see api.ts). */
    restoreSession: builder.mutation<boolean, void>({
      queryFn: async (_arg, baseApi, extraOptions) => {
        const release = await refreshMutex.acquire();
        try {
          return { data: await renewSession(baseApi, extraOptions) };
        } finally {
          release();
        }
      },
    }),

    register: builder.mutation<
      RegisterResponse,
      { name: string; email: string; password: string; acceptTerms: boolean; marketingOptIn: boolean }
    >({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) => storeSession(dispatch, queryFulfilled),
    }),

    login: builder.mutation<LoginResponse, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) => storeSession(dispatch, queryFulfilled),
    }),

    loginSecondFactor: builder.mutation<LoginResponse, { mfaToken: string; code?: string; recoveryCode?: string }>({
      query: (body) => ({ url: "/auth/login/2fa", method: "POST", body }),
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) => storeSession(dispatch, queryFulfilled),
    }),

    logout: builder.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
        } catch {
          // Sign out locally even if the network call failed.
        } finally {
          dispatch(sessionEnded());
          dispatch(api.util.resetApiState());
        }
      },
    }),

    logoutEverywhere: builder.mutation<void, void>({
      query: () => ({ url: "/auth/logout-all", method: "POST" }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
          dispatch(sessionEnded());
          dispatch(api.util.resetApiState());
        } catch {
          // handled by the caller
        }
      },
    }),

    me: builder.query<PublicUser, void>({
      query: () => "/auth/me",
      providesTags: ["Me"],
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          dispatch(userUpdated((await queryFulfilled).data));
        } catch {
          // handled by the caller
        }
      },
    }),

    verifyEmail: builder.mutation<PublicUser, { token: string }>({
      query: (body) => ({ url: "/auth/verify-email", method: "POST", body }),
      invalidatesTags: ["Me"],
    }),

    resendVerification: builder.mutation<void, void>({
      query: () => ({ url: "/auth/resend-verification", method: "POST" }),
    }),

    forgotPassword: builder.mutation<{ message: string }, { email: string }>({
      query: (body) => ({ url: "/auth/forgot-password", method: "POST", body }),
    }),

    setPasswordFromLink: builder.mutation<
      SetPasswordResponse,
      { purpose: "reset-password" | "claim-account"; token: string; password: string }
    >({
      query: ({ purpose, token, password }) => ({ url: `/auth/${purpose}`, method: "POST", body: { token, password } }),
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) => storeSession(dispatch, queryFulfilled),
    }),

    changePassword: builder.mutation<void, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: "/auth/password", method: "PATCH", body }),
      invalidatesTags: ["Sessions"],
    }),

    sessions: builder.query<SessionSummary[], void>({
      query: () => "/auth/sessions",
      providesTags: ["Sessions"],
    }),

    revokeSession: builder.mutation<void, string>({
      query: (id) => ({ url: `/auth/sessions/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: ["Sessions"],
    }),

    twoFactorSetup: builder.mutation<TwoFactorSetup, { password: string }>({
      query: (body) => ({ url: "/auth/2fa/setup", method: "POST", body }),
    }),

    twoFactorEnable: builder.mutation<{ recoveryCodes: string[]; accessToken: string }, { code: string }>({
      query: (body) => ({ url: "/auth/2fa/enable", method: "POST", body }),
      invalidatesTags: ["Me"],
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          // The returned token is two-step verified; use it from now on.
          dispatch(accessTokenRenewed((await queryFulfilled).data.accessToken));
        } catch {
          // handled by the caller
        }
      },
    }),

    twoFactorDisable: builder.mutation<void, { password: string; code: string }>({
      query: (body) => ({ url: "/auth/2fa/disable", method: "POST", body }),
      invalidatesTags: ["Me"],
    }),

    regenerateRecoveryCodes: builder.mutation<{ recoveryCodes: string[] }, { code: string }>({
      query: (body) => ({ url: "/auth/2fa/recovery-codes", method: "POST", body }),
    }),

    updateProfile: builder.mutation<
      PublicUser,
      Partial<Pick<PublicUser, "name" | "preferredCurrency" | "country" | "marketingOptIn">>
    >({
      query: (body) => ({ url: "/users/me", method: "PATCH", body }),
      invalidatesTags: ["Me"],
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          dispatch(userUpdated((await queryFulfilled).data));
        } catch {
          // handled by the caller
        }
      },
    }),

    addresses: builder.query<Address[], void>({
      query: () => "/users/me/addresses",
      providesTags: ["Addresses"],
    }),

    addAddress: builder.mutation<Address[], AddressInput>({
      query: (body) => ({ url: "/users/me/addresses", method: "POST", body }),
      invalidatesTags: ["Addresses"],
    }),

    updateAddress: builder.mutation<Address[], { id: string; address: AddressInput }>({
      query: ({ id, address }) => ({ url: `/users/me/addresses/${encodeURIComponent(id)}`, method: "PUT", body: address }),
      invalidatesTags: ["Addresses"],
    }),

    removeAddress: builder.mutation<Address[], string>({
      query: (id) => ({ url: `/users/me/addresses/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: ["Addresses"],
    }),
  }),
});

export const {
  useRestoreSessionMutation,
  useRegisterMutation,
  useLoginMutation,
  useLoginSecondFactorMutation,
  useLogoutMutation,
  useLogoutEverywhereMutation,
  useMeQuery,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useForgotPasswordMutation,
  useSetPasswordFromLinkMutation,
  useChangePasswordMutation,
  useSessionsQuery,
  useRevokeSessionMutation,
  useTwoFactorSetupMutation,
  useTwoFactorEnableMutation,
  useTwoFactorDisableMutation,
  useRegenerateRecoveryCodesMutation,
  useUpdateProfileMutation,
  useAddressesQuery,
  useAddAddressMutation,
  useUpdateAddressMutation,
  useRemoveAddressMutation,
} = authApi;
