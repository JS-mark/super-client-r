import { Spin, theme } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MainLayout } from "../components/layout/MainLayout";
import { useTitle } from "../hooks/useTitle";
import { pluginService } from "../services/pluginService";

const { useToken } = theme;

export default function PluginPage() {
  const { token } = useToken();
  const { pluginId, "*": pagePath } = useParams<{
    pluginId: string;
    "*": string;
  }>();

  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageTitle_, setPageTitle_] = useState<string>("插件页面");

  const pageTitle = useMemo(
    () => (
      <span
        className="text-sm font-medium"
        style={{ color: token.colorText }}
      >
        {pageTitle_}
      </span>
    ),
    [pageTitle_, token.colorText],
  );
  useTitle(pageTitle);

  const loadPage = useCallback(async () => {
    if (!pluginId) return;
    setLoading(true);
    setError(null);
    try {
      // Build the full path from URL to match against registered pages
      const fullPath = `/plugin/${pluginId}${pagePath ? `/${pagePath}` : ""}`;
      const content = await pluginService.getPluginPageHTML(
        pluginId,
        fullPath,
      );
      setHtml(content.html);
      if (content.title) {
        setPageTitle_(content.title);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [pluginId, pagePath]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  return (
    <MainLayout>
      <div
        className="h-full flex flex-col"
        style={{ backgroundColor: token.colorBgLayout }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spin size="large" />
          </div>
        ) : error ? (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: token.colorError }}
          >
            {error}
          </div>
        ) : html ? (
          <iframe
            srcDoc={html}
            sandbox="allow-scripts allow-forms"
            className="w-full h-full border-0"
            title={`Plugin: ${pluginId}`}
          />
        ) : null}
      </div>
    </MainLayout>
  );
}
