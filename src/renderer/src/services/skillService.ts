import { Skill } from '../types/skills'

// 模拟的 Skill 市场数据，参考 https://skillsmp.com/zh
// 在实际生产环境中，这里应该调用 https://skillsmp.com/api/v1/skills/search 或读取 GitHub 仓库的 marketplace.json
const MOCK_MARKET_SKILLS: Skill[] = [
  {
    id: 'python-interpreter',
    name: 'Python Interpreter',
    description: 'Execute Python code in a sandboxed environment for safe and secure execution. Ideal for data analysis, calculations, and scripting.',
    version: '1.2.0',
    author: 'Anthropic',
    installed: false,
    category: 'Development',
    icon: '🐍',
    homepage: 'https://github.com/anthropics/skills/tree/main/python',
    repository: 'https://github.com/anthropics/skills',
  },
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web using Google Search API to provide real-time information and answer questions about current events.',
    version: '2.0.1',
    author: 'Community',
    installed: false,
    category: 'Productivity',
    icon: '🔍',
    homepage: 'https://github.com/anthropics/skills/tree/main/google-search',
  },
  {
    id: 'data-visualization',
    name: 'Data Visualization',
    description: 'Generate beautiful charts and graphs from your data using ECharts or Matplotlib. Supports various chart types.',
    version: '1.0.5',
    author: 'DataWiz',
    installed: false,
    category: 'Data Science',
    icon: '📊',
  },
  {
    id: 'image-generation',
    name: 'Image Generation',
    description: 'Create images from text descriptions using Stable Diffusion or DALL-E. Perfect for content creation and design.',
    version: '0.9.0',
    author: 'CreativeAI',
    installed: false,
    category: 'Creative',
    icon: '🎨',
  },
  {
    id: 'notion-integration',
    name: 'Notion Integration',
    description: 'Connect to your Notion workspace to read and write pages, databases, and manage your tasks directly from the agent.',
    version: '1.1.2',
    author: 'NotionFan',
    installed: false,
    category: 'Productivity',
    icon: '📝',
  },
  {
    id: 'git-automation',
    name: 'Git Automation',
    description: 'Automate Git workflows including commit, push, pull, and merge operations. Helps maintain your repositories.',
    version: '1.0.0',
    author: 'DevOpsPro',
    installed: false,
    category: 'Development',
    icon: '🐙',
  },
  {
    id: 'weather-forecast',
    name: 'Weather Forecast',
    description: 'Get real-time weather forecasts for any location. Includes temperature, humidity, and precipitation data.',
    version: '1.0.2',
    author: 'WeatherMan',
    installed: false,
    category: 'Lifestyle',
    icon: '🌤️',
  },
  {
    id: 'pdf-reader',
    name: 'PDF Reader',
    description: 'Extract text and information from PDF documents. Useful for analyzing reports and papers.',
    version: '1.3.0',
    author: 'DocTools',
    installed: false,
    category: 'Utilities',
    icon: '📄',
  },
]

export const skillService = {
  async getMarketSkills(): Promise<Skill[]> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 600))
    // 实际场景：
    // const response = await fetch('https://skillsmp.com/api/v1/skills/search?q=')
    // return response.json()
    return MOCK_MARKET_SKILLS
  },

  async getSkillDetails(id: string): Promise<Skill | undefined> {
    await new Promise(resolve => setTimeout(resolve, 300))
    return MOCK_MARKET_SKILLS.find(s => s.id === id)
  },
}
