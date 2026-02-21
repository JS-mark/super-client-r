export const css = `/* Ocean Blue Theme */
:root {
  --color-primary: #0969da;
  --color-primary-hover: #0550ae;
  --color-bg-layout: #f6f8fa;
  --color-bg-container: #ffffff;
  --color-border: #d0d7de;
  --color-text: #1f2328;
  --color-text-secondary: #656d76;
}

.dark {
  --color-primary: #58a6ff;
  --color-primary-hover: #79c0ff;
  --color-bg-layout: #0d1117;
  --color-bg-container: #161b22;
  --color-border: #30363d;
  --color-text: #e6edf3;
  --color-text-secondary: #8b949e;
}
`;

export const tokens = JSON.stringify(
	{
		light: {
			token: {
				colorPrimary: "#0969da",
				colorInfo: "#0969da",
				colorLink: "#0969da",
				colorBgBase: "#ffffff",
				colorTextBase: "rgba(0, 0, 0, 0.88)",
			},
			components: {
				Layout: {
					headerBg: "#ffffff",
					siderBg: "#f6f8fa",
					triggerBg: "#ffffff",
					triggerColor: "rgba(0, 0, 0, 0.65)",
				},
				Card: { colorBgContainer: "#ffffff" },
				Input: { colorBgContainer: "#ffffff", colorBorder: "#d0d7de" },
				Select: { colorBgContainer: "#ffffff", colorBorder: "#d0d7de" },
				Button: { colorBgContainer: "#ffffff", colorBorder: "#d0d7de" },
				Modal: {
					contentBg: "#ffffff",
					headerBg: "#ffffff",
					footerBg: "#ffffff",
				},
				Drawer: { colorBgElevated: "#ffffff" },
				Table: {
					colorBgContainer: "#ffffff",
					headerBg: "#f6f8fa",
					borderColor: "#d0d7de",
				},
				Tooltip: { colorBgSpotlight: "rgba(0, 0, 0, 0.75)" },
				Popover: { colorBgElevated: "#ffffff" },
				Dropdown: { colorBgElevated: "#ffffff" },
			},
		},
		dark: {
			token: {
				colorPrimary: "#58a6ff",
				colorInfo: "#58a6ff",
				colorLink: "#58a6ff",
				colorBgBase: "#0d1117",
				colorTextBase: "rgba(255, 255, 255, 0.88)",
			},
			components: {
				Layout: {
					headerBg: "#161b22",
					siderBg: "#0d1117",
					triggerBg: "#1c2128",
					triggerColor: "rgba(255, 255, 255, 0.65)",
				},
				Card: { colorBgContainer: "#161b22" },
				Input: { colorBgContainer: "#0d1117", colorBorder: "#30363d" },
				Select: { colorBgContainer: "#0d1117", colorBorder: "#30363d" },
				Button: { colorBgContainer: "transparent", colorBorder: "#30363d" },
				Modal: {
					contentBg: "#161b22",
					headerBg: "#161b22",
					footerBg: "#161b22",
				},
				Drawer: { colorBgElevated: "#161b22" },
				Table: {
					colorBgContainer: "#161b22",
					headerBg: "#1c2128",
					borderColor: "#30363d",
				},
				Tooltip: { colorBgSpotlight: "#30363d" },
				Popover: { colorBgElevated: "#161b22" },
				Dropdown: { colorBgElevated: "#161b22" },
			},
		},
	},
	null,
	2,
);
