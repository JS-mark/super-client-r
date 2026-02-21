export const css = `/* Forest Green Theme */
:root {
  --color-primary: #2da44e;
  --color-primary-hover: #218838;
  --color-bg-layout: #f0f7f2;
  --color-bg-container: #ffffff;
  --color-border: #c5deca;
  --color-text: #1a2e1f;
  --color-text-secondary: #5a7a62;
}

.dark {
  --color-primary: #3fb950;
  --color-primary-hover: #56d364;
  --color-bg-layout: #0d1510;
  --color-bg-container: #141f18;
  --color-border: #263d2e;
  --color-text: #d0f0d8;
  --color-text-secondary: #7eb88a;
}
`;

export const tokens = JSON.stringify(
	{
		light: {
			token: {
				colorPrimary: "#2da44e",
				colorInfo: "#2da44e",
				colorLink: "#2da44e",
				colorBgBase: "#ffffff",
				colorTextBase: "rgba(0, 0, 0, 0.88)",
			},
			components: {
				Layout: {
					headerBg: "#ffffff",
					siderBg: "#f0f7f2",
					triggerBg: "#ffffff",
					triggerColor: "rgba(0, 0, 0, 0.65)",
				},
				Card: { colorBgContainer: "#ffffff" },
				Input: { colorBgContainer: "#ffffff", colorBorder: "#c5deca" },
				Select: { colorBgContainer: "#ffffff", colorBorder: "#c5deca" },
				Button: { colorBgContainer: "#ffffff", colorBorder: "#c5deca" },
				Modal: {
					contentBg: "#ffffff",
					headerBg: "#ffffff",
					footerBg: "#ffffff",
				},
				Drawer: { colorBgElevated: "#ffffff" },
				Table: {
					colorBgContainer: "#ffffff",
					headerBg: "#f0f7f2",
					borderColor: "#c5deca",
				},
				Tooltip: { colorBgSpotlight: "rgba(0, 0, 0, 0.75)" },
				Popover: { colorBgElevated: "#ffffff" },
				Dropdown: { colorBgElevated: "#ffffff" },
			},
		},
		dark: {
			token: {
				colorPrimary: "#3fb950",
				colorInfo: "#3fb950",
				colorLink: "#3fb950",
				colorBgBase: "#0d1510",
				colorTextBase: "rgba(255, 255, 255, 0.88)",
			},
			components: {
				Layout: {
					headerBg: "#141f18",
					siderBg: "#0d1510",
					triggerBg: "#1a2b20",
					triggerColor: "rgba(255, 255, 255, 0.65)",
				},
				Card: { colorBgContainer: "#141f18" },
				Input: { colorBgContainer: "#0d1510", colorBorder: "#263d2e" },
				Select: { colorBgContainer: "#0d1510", colorBorder: "#263d2e" },
				Button: { colorBgContainer: "transparent", colorBorder: "#263d2e" },
				Modal: {
					contentBg: "#141f18",
					headerBg: "#141f18",
					footerBg: "#141f18",
				},
				Drawer: { colorBgElevated: "#141f18" },
				Table: {
					colorBgContainer: "#141f18",
					headerBg: "#1a2b20",
					borderColor: "#263d2e",
				},
				Tooltip: { colorBgSpotlight: "#263d2e" },
				Popover: { colorBgElevated: "#141f18" },
				Dropdown: { colorBgElevated: "#141f18" },
			},
		},
	},
	null,
	2,
);
