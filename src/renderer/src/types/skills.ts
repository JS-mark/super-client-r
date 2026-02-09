export interface Skill {
	id: string;
	name: string;
	description: string;
	version: string;
	author: string;
	installed: boolean;
	category?: string;
	icon?: string;
	homepage?: string;
	repository?: string;
	createdAt?: string;
	updatedAt?: string;
}
