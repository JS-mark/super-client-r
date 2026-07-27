export interface AuthUser {
	id: string;
	name: string;
	email?: string;
	avatar?: string;
	provider: "google" | "github" | "email";
}

export const authService = {
	login: (provider: "google" | "github") =>
		window.electron.auth.login(provider),
	sendEmailCode: (email: string) => window.electron.auth.sendEmailCode(email),
	loginWithEmail: (email: string, code: string) =>
		window.electron.auth.loginWithEmail(email, code),
	logout: () => window.electron.auth.logout(),
	getUser: () => window.electron.auth.getUser(),
};
