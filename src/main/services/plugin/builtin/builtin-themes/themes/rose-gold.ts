export const css = `/* Rose Gold Theme */
:root {
  --color-primary: #d4507a;
  --color-primary-hover: #b83d64;
  --color-bg-layout: #fdf2f5;
  --color-bg-container: #ffffff;
  --color-border: #f0d0d9;
  --color-text: #2d1a22;
  --color-text-secondary: #8c6b78;
}

.dark {
  --color-primary: #e87da1;
  --color-primary-hover: #f09ab8;
  --color-bg-layout: #1a1015;
  --color-bg-container: #241820;
  --color-border: #3d2832;
  --color-text: #f0d8e0;
  --color-text-secondary: #b08898;
}
`;

export const tokens = JSON.stringify(
	{
		light: {
			token: {
				colorPrimary: "#d4507a",
				colorInfo: "#d4507a",
				colorLink: "#d4507a",
				colorBgBase: "#ffffff",
				colorTextBase: "rgba(0, 0, 0, 0.88)",
			},
			components: {
				Layout: {
					headerBg: "#ffffff",
					siderBg: "#fdf2f5",
					triggerBg: "#ffffff",
					triggerColor: "rgba(0, 0, 0, 0.65)",
				},
				Card: { colorBgContainer: "#ffffff" },
				Input: { colorBgContainer: "#ffffff", colorBorder: "#f0d0d9" },
				Select: { colorBgContainer: "#ffffff", colorBorder: "#f0d0d9" },
				Button: { colorBgContainer: "#ffffff", colorBorder: "#f0d0d9" },
				Modal: {
					contentBg: "#ffffff",
					headerBg: "#ffffff",
					footerBg: "#ffffff",
				},
				Drawer: { colorBgElevated: "#ffffff" },
				Table: {
					colorBgContainer: "#ffffff",
					headerBg: "#fdf2f5",
					borderColor: "#f0d0d9",
				},
				Tooltip: { colorBgSpotlight: "rgba(0, 0, 0, 0.75)" },
				Popover: { colorBgElevated: "#ffffff" },
				Dropdown: { colorBgElevated: "#ffffff" },
			},
		},
		dark: {
			token: {
				colorPrimary: "#e87da1",
				colorInfo: "#e87da1",
				colorLink: "#e87da1",
				colorBgBase: "#1a1015",
				colorTextBase: "rgba(255, 255, 255, 0.88)",
			},
			components: {
				Layout: {
					headerBg: "#241820",
					siderBg: "#1a1015",
					triggerBg: "#2a1e25",
					triggerColor: "rgba(255, 255, 255, 0.65)",
				},
				Card: { colorBgContainer: "#241820" },
				Input: { colorBgContainer: "#1a1015", colorBorder: "#3d2832" },
				Select: { colorBgContainer: "#1a1015", colorBorder: "#3d2832" },
				Button: { colorBgContainer: "transparent", colorBorder: "#3d2832" },
				Modal: {
					contentBg: "#241820",
					headerBg: "#241820",
					footerBg: "#241820",
				},
				Drawer: { colorBgElevated: "#241820" },
				Table: {
					colorBgContainer: "#241820",
					headerBg: "#2a1e25",
					borderColor: "#3d2832",
				},
				Tooltip: { colorBgSpotlight: "#3d2832" },
				Popover: { colorBgElevated: "#241820" },
				Dropdown: { colorBgElevated: "#241820" },
			},
		},
	},
	null,
	2,
);
