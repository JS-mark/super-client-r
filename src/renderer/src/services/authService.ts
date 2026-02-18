export interface AuthUser {
	id: string;
	name: string;
	email?: string;
	avatar?: string;
	provider: "google" | "github";
}

export const authService = {
	login: (provider: "google" | "github") =>
		window.electron.auth.login(provider),
	logout: () => window.electron.auth.logout(),
	getUser: () => window.electron.auth.getUser(),
};
