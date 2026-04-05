# School Map 重设计实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将 BetterSchool 学校地图页面改造成"地图全屏 + UI 悬浮 + 地图视口驱动列表"的现代地图优先体验。

**架构：** 地图占满全部视口，顶部筛选栏、左侧学校列表、右侧详情面板通过绝对定位悬浮在地图上。`schools/page.tsx` 持有所有状态，SchoolMap 通过回调将圆点点击和地图边界变化通知给父组件。

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Leaflet + react-leaflet, Tailwind CSS

> **注意：** 项目无测试框架（无 Jest）。每个任务使用手动验证步骤替代自动测试。

---

## 文件变更清单

| 文件 | 类型 | 职责 |
|------|------|------|
| `app/page.tsx` | 修改 | 直接 redirect 到 `/schools` |
| `utils/schoolFilters.ts` | 新建 | 纯函数：筛选逻辑、半径计算 |
| `components/SchoolMap.tsx` | 修改 | 新 props：selectedSchool、onSchoolClick、onBoundsChange；圆点大小按分数；选中状态发光效果 |
| `app/schools/page.tsx` | 修改 | 全屏布局、所有悬浮面板、状态管理 |

---

## Task 1: 首页 redirect

**文件：**
- 修改: `app/page.tsx`

- [ ] **Step 1: 修改 `app/page.tsx`**

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/schools');
}
```

- [ ] **Step 2: 手动验证**

运行 `npm run dev`，访问 `http://localhost:3001`，确认自动跳转到 `/schools`。

- [ ] **Step 3: 提交**

```bash
git add app/page.tsx
git commit -m "feat: redirect homepage to /schools"
```

---

## Task 2: 纯函数工具库

**文件：**
- 新建: `utils/schoolFilters.ts`

- [ ] **Step 1: 创建 `utils/schoolFilters.ts`**

```typescript
import { School } from '@/types/school';

export interface FilterState {
  sector: 'all' | 'Government' | 'Non-government';
  minScore: 'all' | '80' | '90' | '95';
  schoolType: 'all' | 'Primary' | 'Combined';
}

/**
 * 根据 score 计算地图圆点半径（px）。
 * score 60 → radius 5; score 100 → radius 18
 */
export function getMarkerRadius(score: number): number {
  const clamped = Math.max(60, Math.min(100, score));
  return 5 + ((clamped - 60) / 40) * 13;
}

/**
 * 按筛选条件过滤学校列表。
 */
export function filterSchools(schools: School[], filters: FilterState): School[] {
  return schools.filter(school => {
    if (filters.sector !== 'all' && school.sector !== filters.sector) return false;
    if (filters.minScore !== 'all' && school.score < parseInt(filters.minScore)) return false;
    if (filters.schoolType !== 'all' && school.school_type !== filters.schoolType) return false;
    return true;
  });
}
```

- [ ] **Step 2: 手动验证**

运行 `npx tsc --noEmit`，确认无 TypeScript 错误。

- [ ] **Step 3: 提交**

```bash
git add utils/schoolFilters.ts
git commit -m "feat: add pure school filter utilities"
```

---

## Task 3: 更新 SchoolMap — 新 Props + 圆点大小 + 选中效果 + 边界回调

**文件：**
- 修改: `components/SchoolMap.tsx`

- [ ] **Step 1: 重写 `components/SchoolMap.tsx`**

```tsx
"use client";

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { School } from '@/types/school';
import { getMarkerRadius } from '@/utils/schoolFilters';

interface SchoolMapProps {
  schools: School[];
  selectedSchool: School | null;
  onSchoolClick: (school: School) => void;
  onBoundsChange: (visibleSchools: School[]) => void;
  onMapClick: () => void;
}

/** 监听地图背景点击（非圆点），通知父组件取消选中。 */
function MapClickTracker({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({ click: onMapClick });
  return null;
}

/** 监听地图移动/缩放，将当前视口内的学校回调给父组件。 */
function BoundsTracker({
  schools,
  onBoundsChange,
}: {
  schools: School[];
  onBoundsChange: (visible: School[]) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      onBoundsChange(schools.filter(s => bounds.contains([s.lat, s.lng])));
    },
    zoomend: () => {
      const bounds = map.getBounds();
      onBoundsChange(schools.filter(s => bounds.contains([s.lat, s.lng])));
    },
  });

  // 首次加载后触发一次
  useEffect(() => {
    const bounds = map.getBounds();
    onBoundsChange(schools.filter(s => bounds.contains([s.lat, s.lng])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools]);

  return null;
}

/** 地图初始化后跳转到 IP 定位位置。 */
function IpLocator() {
  const map = useMap();
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data.latitude && data.longitude) {
          map.setView([data.latitude, data.longitude], 10);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function SchoolMap({
  schools,
  selectedSchool,
  onSchoolClick,
  onBoundsChange,
  onMapClick,
}: SchoolMapProps) {
  const defaultCenter: [number, number] = [-25.2744, 133.7751];

  return (
    <div className="w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={4}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <IpLocator />
        <MapClickTracker onMapClick={onMapClick} />
        <BoundsTracker schools={schools} onBoundsChange={onBoundsChange} />

        {/* 非选中学校 */}
        {schools
          .filter(s => s !== selectedSchool)
          .map((school, index) => {
            if (!school.lat || !school.lng) return null;
            const radius = getMarkerRadius(school.score);
            const fillColor = school.sector === 'Government' ? '#22c55e' : '#f97316';
            return (
              <CircleMarker
                key={`${school.school_name}-${index}`}
                center={[school.lat, school.lng]}
                radius={radius}
                pathOptions={{
                  color: 'white',
                  weight: 1.5,
                  fillColor,
                  fillOpacity: 0.85,
                }}
                eventHandlers={{ click: () => onSchoolClick(school) }}
              />
            );
          })}

        {/* 选中学校（渲染在最上层）：先画发光大圆，再画主圆 */}
        {selectedSchool && selectedSchool.lat && selectedSchool.lng && (
          <>
            <CircleMarker
              key="selected-glow"
              center={[selectedSchool.lat, selectedSchool.lng]}
              radius={getMarkerRadius(selectedSchool.score) + 8}
              pathOptions={{
                color: 'transparent',
                weight: 0,
                fillColor: '#4f46e5',
                fillOpacity: 0.25,
              }}
              interactive={false}
            />
            <CircleMarker
              key="selected-main"
              center={[selectedSchool.lat, selectedSchool.lng]}
              radius={getMarkerRadius(selectedSchool.score)}
              pathOptions={{
                color: 'white',
                weight: 2,
                fillColor: '#4f46e5',
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSchoolClick(selectedSchool) }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 2: 手动验证**

运行 `npm run dev`，访问 `/schools`（此时 page.tsx 还未改，暂时直接访问）：
- 控制台无 TypeScript 错误
- 运行 `npx tsc --noEmit` 通过

- [ ] **Step 3: 提交**

```bash
git add components/SchoolMap.tsx
git commit -m "feat: SchoolMap - score-based marker size, selection glow, bounds callback"
```

---

## Task 4: 重写 Schools 页面 — 全屏布局 + 状态结构

**文件：**
- 修改: `app/schools/page.tsx`

- [ ] **Step 1: 重写 `app/schools/page.tsx`**

用以下代码完整替换原文件：

```tsx
"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { School } from '@/types/school';
import { FilterState, filterSchools } from '@/utils/schoolFilters';

const SchoolMap = dynamic(() => import('../../components/SchoolMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-500">
      加载地图中...
    </div>
  ),
});

const SECTOR_OPTIONS: { label: string; value: FilterState['sector'] }[] = [
  { label: '全部', value: 'all' },
  { label: '政府', value: 'Government' },
  { label: '非政府', value: 'Non-government' },
];

const SCORE_OPTIONS: { label: string; value: FilterState['minScore'] }[] = [
  { label: '全部', value: 'all' },
  { label: '80分+', value: '80' },
  { label: '90分+', value: '90' },
  { label: '95分+', value: '95' },
];

const TYPE_OPTIONS: { label: string; value: FilterState['schoolType'] }[] = [
  { label: '全部', value: 'all' },
  { label: '小学', value: 'Primary' },
  { label: '综合', value: 'Combined' },
];

export default function SchoolsPage() {
  const [allSchools, setAllSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    sector: 'all',
    minScore: 'all',
    schoolType: 'all',
  });
  const [visibleSchools, setVisibleSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [sortBy, setSortBy] = useState<'rank' | 'score'>('rank');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const selectedCardRef = useRef<HTMLDivElement>(null);

  // 加载数据
  useEffect(() => {
    fetch('/data/schools.json')
      .then(res => res.json())
      .then((data: School[]) => {
        setAllSchools(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 过滤后的全量学校（传给地图显示）
  const filteredSchools = useMemo(
    () => filterSchools(allSchools, filters),
    [allSchools, filters]
  );

  // 地图视口内的学校（传给左侧列表）
  const displayedSchools = useMemo(() => {
    return [...visibleSchools].sort((a, b) =>
      sortBy === 'rank' ? a.rank - b.rank : b.score - a.score
    );
  }, [visibleSchools, sortBy]);

  // 选中学校变化时，滚动左侧列表到对应卡片
  useEffect(() => {
    if (selectedSchool && selectedCardRef.current) {
      selectedCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedSchool]);

  function handleSchoolClick(school: School) {
    setSelectedSchool(prev => (prev === school ? null : school));
  }

  function handleMapClick() {
    setSelectedSchool(null);
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* === 地图层（全屏底层） === */}
      <div className="absolute inset-0 z-0">
        {!loading && (
          <SchoolMap
            schools={filteredSchools}
            selectedSchool={selectedSchool}
            onSchoolClick={handleSchoolClick}
            onBoundsChange={setVisibleSchools}
            onMapClick={handleMapClick}
          />
        )}
      </div>

      {/* === 顶部筛选栏 === */}
      <div className="absolute top-3 left-3 right-3 z-10 flex gap-2 flex-wrap items-center pointer-events-none">
        <div className="pointer-events-auto flex gap-2 flex-wrap">
          {/* 办学性质 */}
          <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-md">
            {SECTOR_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, sector: opt.value }))}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.sector === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* 最低评分 */}
          <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-md">
            {SCORE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, minScore: opt.value }))}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.minScore === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* 学校类型 */}
          <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-md">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, schoolType: opt.value }))}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.schoolType === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* === 左侧学校列表面板 === */}
      <div
        className={`absolute top-14 left-3 bottom-3 z-10 flex transition-all duration-300 ${
          leftPanelOpen ? 'w-72' : 'w-8'
        }`}
      >
        {/* 收起/展开按钮 */}
        <button
          onClick={() => setLeftPanelOpen(o => !o)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-12 bg-white rounded-r-md shadow-md flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
          title={leftPanelOpen ? '收起列表' : '展开列表'}
        >
          {leftPanelOpen ? '‹' : '›'}
        </button>

        {leftPanelOpen && (
          <div className="w-full bg-white/95 backdrop-blur-sm rounded-xl shadow-xl flex flex-col overflow-hidden">
            {/* 列表头 */}
            <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-gray-800">
                当前区域 {displayedSchools.length} 所学校
              </span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'rank' | 'score')}
                className="text-xs text-gray-500 border-0 bg-transparent cursor-pointer focus:outline-none"
              >
                <option value="rank">按排名</option>
                <option value="score">按评分</option>
              </select>
            </div>

            {/* 学校卡片列表 */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading ? (
                <p className="text-center text-xs text-gray-400 py-8">加载中...</p>
              ) : displayedSchools.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">
                  当前区域无符合条件的学校
                  <br />
                  <span className="text-gray-300">试试缩小地图或调整筛选条件</span>
                </p>
              ) : (
                displayedSchools.map((school, idx) => {
                  const isSelected = school === selectedSchool;
                  return (
                    <div
                      key={idx}
                      ref={isSelected ? selectedCardRef : null}
                      onClick={() => handleSchoolClick(school)}
                      className={`p-2.5 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-indigo-50 border border-indigo-400 shadow-sm'
                          : 'bg-white border border-gray-100 hover:border-gray-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <h3 className="text-xs font-semibold text-gray-900 leading-tight">
                          {school.school_name}
                        </h3>
                        <span
                          className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {school.score}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {school.suburb}, {school.state}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                            school.sector === 'Government'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {school.sector === 'Government' ? '政府' : '非政府'}
                        </span>
                        <span className="text-[10px] text-gray-400">#{school.rank}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* === 右侧学校详情面板 === */}
      {selectedSchool && (
        <div className="absolute top-14 right-3 bottom-3 z-10 w-56 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl flex flex-col overflow-hidden">
          {/* 面板头 */}
          <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
            <span className="text-xs font-bold text-indigo-600">学校详情</span>
            <button
              onClick={handleMapClick}
              className="text-gray-400 hover:text-gray-700 text-base leading-none"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {/* 学校名 + 评分 */}
            <div className="flex justify-between items-start gap-2 mb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900 leading-tight">
                  {selectedSchool.school_name}
                </h2>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {selectedSchool.suburb}, {selectedSchool.state} {selectedSchool.postcode}
                </p>
              </div>
              <div className="shrink-0 bg-indigo-600 text-white text-center rounded-lg px-2 py-1">
                <div className="text-lg font-black leading-none">{selectedSchool.score}</div>
                <div className="text-[8px] font-normal">分</div>
              </div>
            </div>

            {/* 详情列表 */}
            <div className="bg-gray-50 rounded-lg p-2.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">全国排名</span>
                <span className="font-bold text-gray-800">#{selectedSchool.rank}</span>
              </div>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between items-center">
                <span className="text-gray-500">办学性质</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    selectedSchool.sector === 'Government'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  {selectedSchool.sector === 'Government' ? '政府' : '非政府'}
                </span>
              </div>
              {selectedSchool.school_type && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">学校类型</span>
                    <span className="font-medium text-gray-800">
                      {selectedSchool.school_type === 'Primary' ? '小学' : selectedSchool.school_type}
                    </span>
                  </div>
                </>
              )}
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">邮编</span>
                <span className="font-medium text-gray-800">{selectedSchool.postcode}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === 地图图例（右下角） === */}
      <div className="absolute bottom-8 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-[10px] text-gray-600 space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500 border border-white inline-block shrink-0"></span>
          政府学校
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-500 border border-white inline-block shrink-0"></span>
          非政府学校
        </div>
        <div className="flex items-center gap-2">
          <span className="flex gap-0.5 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block"></span>
            <span className="w-3.5 h-3.5 rounded-full bg-gray-400 inline-block"></span>
          </span>
          <span>大小 = 评分</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 手动验证**

运行 `npm run dev`，访问 `http://localhost:3001/schools`，检查：
1. 地图占满全屏
2. 顶部筛选 chip 可见
3. 左侧列表面板显示当前视口内的学校（拖动地图后列表更新）
4. 点击列表卡片 → 地图上对应圆点变紫色 + 发光 + 右侧详情面板出现
5. 点击地图圆点 → 左侧列表滚动到对应卡片 + 右侧详情面板出现
6. 点击详情面板 ✕ → 面板关闭，圆点恢复原色
7. 点击左侧面板 `‹` 按钮 → 面板收起，地图可见区域变大
8. 筛选 chip 切换后圆点和列表实时更新

- [ ] **Step 3: 提交**

```bash
git add app/schools/page.tsx
git commit -m "feat: schools page - full-screen map layout with floating panels"
```

---

## Task 5: 最终清理与验证

**文件：**
- 检查: `components/SchoolMap.tsx`（清理旧的 `MapUpdater` 残留逻辑）

- [ ] **Step 1: 移除旧 API 路由的注释（可选清理）**

`app/schools/page.tsx` 中原来有对 `app/pages/api/locations.ts` 的注释引用，确认已删除。若有残留未使用的 import，运行：

```bash
npx tsc --noEmit
```

确认零错误。

- [ ] **Step 2: 构建验证**

```bash
npm run build
```

预期输出无错误，可以看到 `/schools` 路由编译成功。

- [ ] **Step 3: 将 `.superpowers/` 加入 `.gitignore`**

在 `.gitignore` 追加：
```
.superpowers/
```

- [ ] **Step 4: 最终提交**

```bash
git add .gitignore
git commit -m "chore: add .superpowers to gitignore"
```

---

## 验收标准

全部完成后，以下场景应正常工作：

| 场景 | 预期行为 |
|------|----------|
| 访问 `http://localhost:3001` | 自动跳转到 `/schools` |
| 打开 `/schools` | 地图全屏，IP 定位到当前城市，左侧列表显示视口内学校 |
| 拖动/缩放地图 | 左侧列表实时更新 |
| 点击筛选 chip | 圆点和列表同步过滤 |
| 点击列表卡片 | 圆点变紫色发光，右侧详情面板出现 |
| 点击地图圆点 | 同上，列表滚动到对应卡片 |
| 点击 ✕ 或再次点击 | 取消选中，详情面板关闭 |
| 点击 `‹` 收起左侧面板 | 地图视野扩大，再点 `›` 恢复 |
| 大圆点 vs 小圆点 | 高分学校圆点明显更大 |
