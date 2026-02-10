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
	readme?: string;
	createdAt?: string;
	updatedAt?: string;
}
