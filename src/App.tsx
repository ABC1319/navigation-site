import { useState, useEffect, useMemo, useRef } from 'react'
import './App.css'

// 多源 Logo 获取 URLs（按优先级排序）
const getLogoUrls = (domain: string): string[] => {
  if (!domain) return []
  return [
    `https://www.faviconextractor.com/favicon/${domain}?larger=true`,
    `https://favicon.im/${domain}`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://api.iowen.cn/favicon/${domain}.png`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ]
}

// 从 URL 获取域名
const getDomainFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// 链接类型定义
interface Link {
  name: string
  url: string
  desc: string
  logo?: string
}

// 分类类型定义
interface Category {
  name: string
  icon: string
  links: Link[]
  children?: Category[]
}

// Logo 组件
const SiteLogo = ({ url, name, logo }: { url: string; name: string; logo?: string }) => {
  const [logoStatus, setLogoStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0)
  
  const domain = useMemo(() => getDomainFromUrl(url), [url])
  const logoUrls = useMemo(() => getLogoUrls(domain), [domain])
  const firstChar = name.charAt(0).toUpperCase()
  
  // 如果有自定义 logo，优先使用
  const imageUrl = logo || logoUrls[currentUrlIndex]
  
  const handleError = () => {
    if (logo) {
      // 自定义 logo 失败，切换到自动获取
      setLogoStatus('loading')
    } else if (currentUrlIndex < logoUrls.length - 1) {
      setCurrentUrlIndex(prev => prev + 1)
    } else {
      setLogoStatus('error')
    }
  }
  
  const handleLoad = () => {
    setLogoStatus('loaded')
  }
  
  if (logoStatus === 'error' || (!logo && logoUrls.length === 0)) {
    return (
      <div className="link-logo">
        <span className="logo-text">{firstChar}</span>
      </div>
    )
  }
  
  return (
    <div className="link-logo">
      <img
        src={imageUrl}
        alt=""
        className={`logo-img ${logoStatus === 'loaded' ? 'visible' : ''}`}
        onLoad={handleLoad}
        onError={handleError}
      />
      {logoStatus !== 'loaded' && <span className="logo-text">{firstChar}</span>}
    </div>
  )
}

// 递归渲染多级分类
const CategoryTree = ({
  category,
  level = 0,
  favorites,
  toggleFavorite,
  collapsedCategories,
  toggleCategory
}: {
  category: Category
  level?: number
  favorites: string[]
  toggleFavorite: (url: string) => void
  collapsedCategories: Set<string>
  toggleCategory: (name: string) => void
}) => {
  const isCollapsed = collapsedCategories.has(category.name)
  const hasChildren = category.children && category.children.length > 0
  const hasLinks = category.links && category.links.length > 0
  
  return (
    <div className={`category-tree ${level > 0 ? 'sub-category' : ''}`}>
      <h2 
        className="category-title" 
        onClick={() => toggleCategory(category.name)}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        <span className="category-icon">{category.icon}</span>
        {category.name}
        <span className="collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
      </h2>
      
      {!isCollapsed && (
        <>
          {hasLinks && (
            <div className="links-grid" style={{ paddingLeft: `${level * 16}px` }}>
              {category.links.map((link) => (
                <div key={link.url} className="link-card">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-content"
                  >
                    <SiteLogo url={link.url} name={link.name} logo={link.logo} />
                    <div className="link-info">
                      <span className="link-name">{link.name}</span>
                      <span className="link-desc">{link.desc || link.name}</span>
                    </div>
                  </a>
                  <button
                    className={`fav-btn ${favorites.includes(link.url) ? 'active' : ''}`}
                    onClick={(e) => {
                      e.preventDefault()
                      toggleFavorite(link.url)
                    }}
                    title={favorites.includes(link.url) ? '取消收藏' : '添加收藏'}
                  >
                    {favorites.includes(link.url) ? '★' : '☆'}
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {hasChildren && category.children!.map(child => (
            <CategoryTree
              key={child.name}
              category={child}
              level={level + 1}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              collapsedCategories={collapsedCategories}
              toggleCategory={toggleCategory}
            />
          ))}
        </>
      )}
    </div>
  )
}



// 从 data.json 转换分类数据
const convertDataJson = (data: any[]): Category[] => {
  if (!Array.isArray(data)) return []
  
  const iconMap: Record<string, string> = {
    'drug': '💊',
    '学术搜索': '🔍',
    'SciHub文献': '📄',
    '默认': '📁'
  }
  
  const getIcon = (title: string) => iconMap[title] || '📁'
  
  const convertFolder = (folder: any): Category => {
    const category: Category = {
      name: folder.title,
      icon: getIcon(folder.title),
      links: [],
      children: []
    }
    
    // 转换书签为链接
    if (folder.bookmarks && Array.isArray(folder.bookmarks)) {
      category.links = folder.bookmarks.map((bookmark: any) => ({
        name: bookmark.name,
        url: bookmark.url,
        desc: bookmark.desc || bookmark.name,
        logo: bookmark.logoUrl
      }))
    }
    
    // 递归转换子文件夹
    if (folder.folders && Array.isArray(folder.folders)) {
      category.children = folder.folders.map(convertFolder)
    }
    
    return category
  }
  
  return data.flatMap(item => {
    if (item.folders && Array.isArray(item.folders)) {
      return item.folders.map(convertFolder)
    }
    return []
  })
}

// 基础分类数据（默认数据，会被 data.json 覆盖）
let baseCategories: Category[] = []

// 尝试从 data.json 加载数据
try {
  const dataJson = JSON.parse(localStorage.getItem('nav-data-json') || '[]')
  if (dataJson.length > 0) {
    baseCategories = convertDataJson(dataJson)
  }
} catch {
  baseCategories = []
}

// 如果 localStorage 没有数据，从 public/data.json 加载
if (baseCategories.length === 0) {
  fetch('/data.json')
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem('nav-data-json', JSON.stringify(data))
        window.location.reload()
      }
    })
    .catch(() => {
      // 使用默认数据
      baseCategories = [
        {
          name: '开发工具',
          icon: '💻',
          links: [
            { name: 'GitHub', url: 'https://github.com', desc: '代码托管平台' },
            { name: 'Stack Overflow', url: 'https://stackoverflow.com', desc: '开发者问答社区' },
          ]
        },
        {
          name: '设计资源',
          icon: '🎨',
          links: [
            { name: 'Figma', url: 'https://figma.com', desc: '协作设计工具' },
            { name: 'Dribbble', url: 'https://dribbble.com', desc: '设计灵感社区' },
          ]
        },
      ]
    })
}

type Theme = 'minimal' | 'card' | 'glass'
type ColorScheme = 'light' | 'dark'

function App() {
  const [theme, setTheme] = useState<Theme>('card')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('light')
  const [searchQuery, setSearchQuery] = useState('')
  const [favorites, setFavorites] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSite, setNewSite] = useState({ name: '', url: '', desc: '' })
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [customCategories, setCustomCategories] = useState<Category[]>([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [importType, setImportType] = useState<'html' | 'json'>('html')
  const [importData, setImportData] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 从 localStorage 加载数据
  useEffect(() => {
    const savedFavorites = localStorage.getItem('nav-favorites')
    const savedTheme = localStorage.getItem('nav-theme') as Theme
    const savedColorScheme = localStorage.getItem('nav-color-scheme') as ColorScheme
    const savedCollapsed = localStorage.getItem('nav-collapsed')
    const savedCustomCategories = localStorage.getItem('nav-custom-categories')
    
    if (savedFavorites) setFavorites(JSON.parse(savedFavorites))
    if (savedTheme) setTheme(savedTheme)
    if (savedColorScheme) setColorScheme(savedColorScheme)
    if (savedCollapsed) setCollapsedCategories(new Set(JSON.parse(savedCollapsed)))
    if (savedCustomCategories) setCustomCategories(JSON.parse(savedCustomCategories))
  }, [])

  // 保存到 localStorage
  useEffect(() => {
    localStorage.setItem('nav-favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    localStorage.setItem('nav-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('nav-color-scheme', colorScheme)
  }, [colorScheme])

  useEffect(() => {
    localStorage.setItem('nav-collapsed', JSON.stringify([...collapsedCategories]))
  }, [collapsedCategories])

  useEffect(() => {
    localStorage.setItem('nav-custom-categories', JSON.stringify(customCategories))
  }, [customCategories])

  // 监听滚动显示/隐藏回到顶部按钮
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const toggleFavorite = (url: string) => {
    setFavorites(prev => 
      prev.includes(url) 
        ? prev.filter(f => f !== url)
        : [...prev, url]
    )
  }

  const addCustomSite = () => {
    if (newSite.name && newSite.url) {
      const site: Link = { 
        name: newSite.name, 
        url: newSite.url.startsWith('http') ? newSite.url : `https://${newSite.url}`,
        desc: newSite.desc || newSite.name
      }
      const customCat = customCategories.find(c => c.name === '我的收藏')
      if (customCat) {
        customCat.links.push(site)
        setCustomCategories([...customCategories])
      } else {
        setCustomCategories([{ name: '我的收藏', icon: '🔖', links: [site] }, ...customCategories])
      }
      setNewSite({ name: '', url: '', desc: '' })
      setShowAddModal(false)
    }
  }

  const toggleCategory = (categoryName: string) => {
    setCollapsedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName)
      } else {
        newSet.add(categoryName)
      }
      return newSet
    })
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 解析浏览器书签 HTML
  const parseBookmarkHtml = (html: string): Category[] => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const root = doc.querySelector('dl')
    if (!root) return []

    const parseFolder = (element: Element, level = 0): Category[] => {
      const categories: Category[] = []
      let currentCategory: Category | null = null

      for (const child of element.children) {
        if (child.tagName === 'DT') {
          const h3 = child.querySelector('h3')
          const a = child.querySelector('a')
          const dl = child.querySelector('dl')

          if (h3) {
            // 这是一个文件夹
            currentCategory = {
              name: h3.textContent || '未命名文件夹',
              icon: level === 0 ? '📁' : '📂',
              links: [],
              children: []
            }
            if (dl) {
              currentCategory.children = parseFolder(dl, level + 1)
            }
            categories.push(currentCategory)
          } else if (a && currentCategory) {
            // 这是一个书签
            const url = a.getAttribute('href') || ''
            const name = a.textContent || ''
            currentCategory.links.push({
              name,
              url,
              desc: name // 如果没有描述，使用名称代替
            })
          }
        }
      }

      return categories
    }

    return parseFolder(root)
  }

  // 处理导入
  const handleImport = () => {
    if (!importData.trim()) return

    try {
      let newCategories: Category[] = []

      if (importType === 'html') {
        newCategories = parseBookmarkHtml(importData)
      } else {
        // JSON 导入
        const parsed = JSON.parse(importData)
        if (Array.isArray(parsed)) {
          newCategories = parsed
        } else if (parsed.categories) {
          newCategories = parsed.categories
        }
      }

      if (newCategories.length > 0) {
        // 为每个链接自动获取 logo
        newCategories.forEach(cat => {
          cat.links.forEach(link => {
            if (!link.logo) {
              const domain = getDomainFromUrl(link.url)
              const logoUrls = getLogoUrls(domain)
              if (logoUrls.length > 0) {
                link.logo = logoUrls[0]
              }
            }
            // 如果没有描述，使用名称代替
            if (!link.desc) {
              link.desc = link.name
            }
          })
          // 递归处理子分类
          if (cat.children) {
            cat.children.forEach(child => {
              child.links.forEach(link => {
                if (!link.logo) {
                  const domain = getDomainFromUrl(link.url)
                  const logoUrls = getLogoUrls(domain)
                  if (logoUrls.length > 0) {
                    link.logo = logoUrls[0]
                  }
                }
                if (!link.desc) {
                  link.desc = link.name
                }
              })
            })
          }
        })

        setCustomCategories([...newCategories, ...customCategories])
        setImportData('')
        setShowImportModal(false)
        alert(`成功导入 ${newCategories.length} 个分类`)
      }
    } catch (error) {
      alert('导入失败，请检查数据格式')
      console.error(error)
    }
  }

  // 处理文件上传
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setImportData(content)
      // 根据文件扩展名判断类型
      if (file.name.endsWith('.json')) {
        setImportType('json')
      } else {
        setImportType('html')
      }
    }
    reader.readAsText(file)
  }

  // 导出为 HTML 书签
  const exportToHtml = () => {
    const generateBookmarkHtml = (categories: Category[], level = 0): string => {
      let html = '<DL>\n'
      categories.forEach(cat => {
        html += `${'  '.repeat(level)}<DT><H3>${cat.name}</H3>\n`
        if (cat.links.length > 0) {
          html += `${'  '.repeat(level)}<DL>\n`
          cat.links.forEach(link => {
            html += `${'  '.repeat(level + 1)}<DT><A HREF="${link.url}">${link.name}</A></DT>\n`
          })
          html += `${'  '.repeat(level)}</DL>\n`
        }
        if (cat.children && cat.children.length > 0) {
          html += generateBookmarkHtml(cat.children, level + 1)
        }
      })
      html += '</DL>\n'
      return html
    }

    const allCategories = [...customCategories, ...baseCategories]
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
${generateBookmarkHtml(allCategories)}`

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bookmarks.html'
    a.click()
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  // 导出为 JSON
  const exportToJson = () => {
    const allCategories = [...customCategories, ...baseCategories]
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      categories: allCategories
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `navigation-data-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  // 清空自定义分类
  const clearCustomCategories = () => {
    if (confirm('确定要清空所有导入的分类吗？此操作不可恢复。')) {
      setCustomCategories([])
    }
  }

  // 组合所有分类
  const allCategories = [...customCategories, ...baseCategories]

  // 过滤分类
  const filteredCategories = searchQuery
    ? allCategories.map(cat => ({
        ...cat,
        links: cat.links.filter((link: Link) => 
          link.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (link.desc && link.desc.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      })).filter(cat => cat.links.length > 0 || (cat.children && cat.children.some(child => 
        child.links.some((link: Link) => 
          link.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (link.desc && link.desc.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      )))
    : allCategories

  const themeLabels: Record<Theme, string> = {
    minimal: '极简',
    card: '卡片',
    glass: '毛玻璃'
  }

  return (
    <div className={`app theme-${theme} scheme-${colorScheme}`}>
      {/* 顶部工具栏 */}
      <div className="top-bar">
        <div className="theme-switcher">
          <span className="theme-label">主题:</span>
          {(['minimal', 'card', 'glass'] as Theme[]).map(t => (
            <button
              key={t}
              className={`theme-btn ${theme === t ? 'active' : ''}`}
              onClick={() => setTheme(t)}
            >
              {themeLabels[t]}
            </button>
          ))}
        </div>
        <button 
          className="color-scheme-btn" 
          onClick={() => setColorScheme(colorScheme === 'light' ? 'dark' : 'light')}
          title={colorScheme === 'light' ? '切换至夜间模式' : '切换至日间模式'}
        >
          {colorScheme === 'light' ? '🌙' : '☀️'}
        </button>
        <button className="add-site-btn" onClick={() => setShowAddModal(true)}>
          + 添加网站
        </button>
        <button className="import-btn" onClick={() => setShowImportModal(true)}>
          📥 导入
        </button>
        <button className="export-btn" onClick={() => setShowExportModal(true)}>
          📤 导出
        </button>
        {customCategories.length > 0 && (
          <button className="clear-btn" onClick={clearCustomCategories}>
            🗑️ 清空导入
          </button>
        )}
      </div>

      {/* 头部搜索 */}
      <header className="header">
        <h1 className="logo">
          <span className="logo-icon">🧭</span>
          我的导航
        </h1>
        <div className="search-box">
          <input
            type="text"
            placeholder="搜索网站..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
      </header>

      {/* 收藏夹快捷访问 */}
      {favorites.length > 0 && !searchQuery && (
        <section className="favorites-section">
          <h2 className="section-title">⭐ 快速访问</h2>
          <div className="favorites-grid">
            {allCategories.flatMap(cat => cat.links)
              .filter(link => favorites.includes(link.url))
              .map(link => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="favorite-item"
                >
                  <span className="fav-name">{link.name}</span>
                </a>
              ))}
          </div>
        </section>
      )}

      {/* 分类导航 */}
      <main className="main-content">
        {filteredCategories.map(category => (
          <CategoryTree
            key={category.name}
            category={category}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
            collapsedCategories={collapsedCategories}
            toggleCategory={toggleCategory}
          />
        ))}
      </main>

      {/* 添加网站弹窗 */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>添加自定义网站</h3>
            <input
              type="text"
              placeholder="网站名称"
              value={newSite.name}
              onChange={e => setNewSite({...newSite, name: e.target.value})}
            />
            <input
              type="text"
              placeholder="网址 (如: example.com)"
              value={newSite.url}
              onChange={e => setNewSite({...newSite, url: e.target.value})}
            />
            <input
              type="text"
              placeholder="描述 (可选)"
              value={newSite.desc}
              onChange={e => setNewSite({...newSite, desc: e.target.value})}
            />
            <div className="modal-actions">
              <button onClick={() => setShowAddModal(false)}>取消</button>
              <button onClick={addCustomSite} className="primary">添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入弹窗 */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal import-modal" onClick={e => e.stopPropagation()}>
            <h3>导入数据</h3>
            <div className="import-type-selector">
              <button 
                className={importType === 'html' ? 'active' : ''}
                onClick={() => setImportType('html')}
              >
                浏览器书签 (HTML)
              </button>
              <button 
                className={importType === 'json' ? 'active' : ''}
                onClick={() => setImportType('json')}
              >
                JSON 数据
              </button>
            </div>
            <div className="file-upload">
              <input
                type="file"
                ref={fileInputRef}
                accept={importType === 'html' ? '.html,.htm' : '.json'}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button onClick={() => fileInputRef.current?.click()}>
                📁 选择文件
              </button>
            </div>
            <textarea
              placeholder={importType === 'html' 
                ? '粘贴浏览器导出的书签 HTML 内容...' 
                : '粘贴 JSON 数据...'}
              value={importData}
              onChange={e => setImportData(e.target.value)}
              rows={10}
            />
            <div className="modal-actions">
              <button onClick={() => setShowImportModal(false)}>取消</button>
              <button onClick={handleImport} className="primary" disabled={!importData.trim()}>
                导入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出弹窗 */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>导出数据</h3>
            <p>选择导出格式：</p>
            <div className="export-options">
              <button onClick={exportToHtml} className="export-option">
                <span className="export-icon">🌐</span>
                <span className="export-label">导出为 HTML 书签</span>
                <span className="export-desc">可用于导入浏览器</span>
              </button>
              <button onClick={exportToJson} className="export-option">
                <span className="export-icon">📋</span>
                <span className="export-label">导出为 JSON</span>
                <span className="export-desc">包含完整数据（分类、Logo、描述）</span>
              </button>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowExportModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 回到顶部按钮 */}
      {showBackToTop && (
        <button className="back-to-top" onClick={scrollToTop}>
          ↑
        </button>
      )}
    </div>
  )
}

export default App
