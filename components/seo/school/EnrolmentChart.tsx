import type { Cohort } from '@/lib/schoolInsights';

export interface CohortBar extends Cohort {
  label: string;
}

/**
 * One bar per offered year level.
 *
 * Plain boxes rather than a chart library: these pages ship no client
 * JavaScript of their own, and the numbers are printed on the bars so nothing
 * depends on hover. The fill is the school's own sector colour — on this site
 * hue means sector and nothing else.
 */
export default function EnrolmentChart({
  bars,
  color,
  caption,
}: {
  bars: CohortBar[];
  color: string;
  /** Read out in place of the bars; the table below it carries the numbers. */
  caption: string;
}) {
  const max = Math.max(1, ...bars.map(bar => bar.count ?? 0));

  return (
    <figure className="mt-4">
      <div className="overflow-x-auto no-scrollbar">
        <table className="border-separate border-spacing-x-1.5 border-spacing-y-0 text-center">
          <caption className="sr-only">{caption}</caption>
          <tbody>
            <tr aria-hidden="true">
              {bars.map(bar => (
                <td key={bar.key} className="w-12 min-w-10 p-0">
                  {/* Percentage heights do not resolve against a table cell, so
                      the bar is sized inside a fixed-height flex box. */}
                  <div className="flex h-32 items-end">
                    {bar.count === null ? (
                      <div className="h-2 w-full rounded-t border border-dashed border-gray-300" />
                    ) : (
                      <div
                        className="w-full rounded-t"
                        style={{ height: `${Math.max(2, (bar.count / max) * 100)}%`, backgroundColor: color }}
                      />
                    )}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              {bars.map(bar => (
                <td key={bar.key} className="pt-1.5 text-sm font-semibold tabular-nums text-gray-900">
                  {bar.count ?? '–'}
                </td>
              ))}
            </tr>
          </tbody>
          <tfoot>
            <tr>
              {bars.map(bar => (
                <th key={bar.key} scope="col" className="text-[11px] font-normal text-gray-500 whitespace-nowrap">
                  {bar.label}
                </th>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </figure>
  );
}
