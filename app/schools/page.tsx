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
  { label: '中学', value: 'Secondary' },
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
  const [geoReady, setGeoReady] = useState(false);
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
            flyToSchool={selectedSchool}
            onGeoReady={() => setGeoReady(true)}
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
                {geoReady ? `当前区域 ${displayedSchools.length} 所学校` : '正在定位...'}
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
              ) : !geoReady ? (
                <p className="text-center text-xs text-gray-400 py-8">正在定位...</p>
              ) : displayedSchools.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">
                  当前区域无符合条件的学校
                  <br />
                  <span className="text-gray-300">试试缩小地图或调整筛选条件</span>
                </p>
              ) : (
                displayedSchools.map((school) => {
                  const isSelected = school === selectedSchool;
                  return (
                    <div
                      key={school.school_name}
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
                      {{ Primary: '小学', Combined: '综合', Secondary: '中学' }[selectedSchool.school_type] ?? selectedSchool.school_type}
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
