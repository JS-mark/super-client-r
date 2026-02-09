/**
 * Skill Store Tests
 */
import { describe, expect, it, beforeEach } from "vitest";
import { useSkillStore } from "../skillStore";

describe("Skill Store", () => {
	beforeEach(() => {
		// Reset store state
		const store = useSkillStore.getState();
		store.installedSkills.forEach((skill) => {
			store.uninstallSkill(skill.id);
		});
	});

	describe("Installed Skills", () => {
		it("should add a skill to installed list", () => {
			const store = useSkillStore.getState();
			const skill = {
				id: "skill_1",
				name: "Test Skill",
				description: "A test skill",
				version: "1.0.0",
				author: "Test Author",
				installed: true,
			};

			store.installSkill(skill);

			expect(store.installedSkills).toHaveLength(1);
			expect(store.installedSkills[0].name).toBe("Test Skill");
		});

		it("should not add duplicate skills", () => {
			const store = useSkillStore.getState();
			const skill = {
				id: "skill_1",
				name: "Test Skill",
				description: "A test skill",
				version: "1.0.0",
				author: "Test Author",
				installed: true,
			};

			store.installSkill(skill);
			store.installSkill(skill);

			expect(store.installedSkills).toHaveLength(1);
		});

		it("should uninstall a skill", () => {
			const store = useSkillStore.getState();
			const skill = {
				id: "skill_1",
				name: "Test Skill",
				description: "A test skill",
				version: "1.0.0",
				author: "Test Author",
				installed: true,
			};

			store.installSkill(skill);
			store.uninstallSkill("skill_1");

			expect(store.installedSkills).toHaveLength(0);
		});
	});

	describe("Market Skills", () => {
		it("should set market items", () => {
			const store = useSkillStore.getState();
			const marketItems = [
				{
					id: "market_1",
					name: "Market Skill",
					description: "From market",
					version: "1.0.0",
					author: "Author",
					installed: false,
				},
			];

			store.setMarketItems(marketItems);

			expect(store.marketSkills).toHaveLength(1);
			expect(store.marketSkills[0].name).toBe("Market Skill");
		});
	});

	describe("Update Check", () => {
		it("should detect update available", () => {
			const store = useSkillStore.getState();

			// Install older version
			store.installSkill({
				id: "skill_1",
				name: "Test Skill",
				description: "A test skill",
				version: "1.0.0",
				author: "Test Author",
				installed: true,
			});

			// Set newer version in market
			store.setMarketItems([
				{
					id: "skill_1",
					name: "Test Skill",
					description: "A test skill",
					version: "2.0.0",
					author: "Test Author",
					installed: false,
				},
			]);

			expect(store.checkUpdate("skill_1")).toBe(true);
		});

		it("should return false when versions match", () => {
			const store = useSkillStore.getState();

			store.installSkill({
				id: "skill_1",
				name: "Test Skill",
				description: "A test skill",
				version: "1.0.0",
				author: "Test Author",
				installed: true,
			});

			store.setMarketItems([
				{
					id: "skill_1",
					name: "Test Skill",
					description: "A test skill",
					version: "1.0.0",
					author: "Test Author",
					installed: false,
				},
			]);

			expect(store.checkUpdate("skill_1")).toBe(false);
		});
	});
});
