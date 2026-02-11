import React, {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

// 标题内容类型：可以是字符串或 React 组件
type TitleContent = string | ReactNode;

interface TitleContextType {
	title: TitleContent;
	setTitle: (title: TitleContent) => void;
}

const TitleContext = createContext<TitleContextType | null>(null);

export const TitleProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const [title, setTitle] = useState<TitleContent>(() => {
		// 尝试从路由获取初始标题
		return undefined;
	});

	return (
		<TitleContext.Provider value={{ title, setTitle }}>
			{children}
		</TitleContext.Provider>
	);
};

export const useTitleContext = () => {
	const context = useContext(TitleContext);
	if (!context) {
		throw new Error("useTitleContext must be used within TitleProvider");
	}
	return context;
};

/**
 * Hook to set the title from a page component
 * @param title - The title content (string or React component)
 */
export const useTitle = (title: TitleContent) => {
	const { setTitle } = useTitleContext();

	// 使用 ref 来避免依赖变化导致的无限循环
	const setTitleRef = React.useRef(setTitle);
	setTitleRef.current = setTitle;

	// 只在 title 变化时更新，避免无限循环
	useEffect(() => {
		setTitleRef.current(title);
	}, [title]);
};

export type { TitleContent };
