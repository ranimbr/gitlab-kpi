import { useMemo } from "react";
import Chart from "react-apexcharts";

export default function ScoreRadarChart({ snapshot, height = 300 }) {
  const options = useMemo(() => {
    return {
      chart: {
        type: 'radar',
        toolbar: { show: false },
        animations: { enabled: true, easing: "easeinout", speed: 800 },
        dropShadow: { enabled: true, blur: 5, left: 1, top: 1, color: '#4F46E5', opacity: 0.1 }
      },
      labels: [
        'MR Rate',
        'Approbations',
        'Merges',
        'Commits',
        'Relecture',
      ],
      stroke: { width: 2, colors: ['#4F46E5'] },
      fill: { opacity: 0.3, colors: ['#4F46E5'] },
      markers: { size: 4, colors: ['#fff'], strokeColors: '#4F46E5', strokeWidth: 2 },
      yaxis: { show: false, min: 0, max: 100 },
      xaxis: {
        labels: {
          style: {
            colors: ['#475569', '#475569', '#475569', '#475569', '#475569'],
            fontSize: '11px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
          }
        }
      },
      dataLabels: { enabled: true, style: { fontSize: '10px', colors: ['#333'] } },
      plotOptions: {
        radar: {
          polygons: { strokeColors: '#E2E8F0', connectorColors: '#E2E8F0' }
        }
      },
      tooltip: {
        y: { formatter: (val) => val + " pts" }
      }
    };
  }, []);

  const series = useMemo(() => {
    if (!snapshot) return [{ name: "Score", data: [0, 0, 0, 0, 0] }];
    
    // Normaliser les valeurs sur 100 pour le radar
    // 1. MR Rate (target: ex: 2.0 -> 100)
    const mrScore = Math.min((snapshot.mr_rate_per_site / 2) * 100, 100) || 0;
    // 2. Approved MR Rate (déjà en %, 1.0 = 100%)
    const appScore = (snapshot.approved_mr_rate || 0) * 100;
    // 3. Merged MR Rate (déjà en %, 1.0 = 100%)
    const mrgScore = (snapshot.merged_mr_rate || 0) * 100;
    // 4. Commit Rate (target: ex: 10 -> 100)
    const comScore = Math.min((snapshot.commit_rate_per_site / 10) * 100, 100) || 0;
    // 5. Avg Review Time (< 24h = 100, > 72h = 0)
    const rvwTime = snapshot.avg_review_time_hours || 0;
    const rvwScore = rvwTime <= 0 ? 0 : Math.max(100 - (rvwTime / 72) * 100, 0);

    return [{
      name: "Score (normalisé)",
      data: [
        Math.round(mrScore),
        Math.round(appScore),
        Math.round(mrgScore),
        Math.round(comScore),
        Math.round(rvwScore)
      ]
    }];
  }, [snapshot]);

  if (!snapshot) return null;

  return (
    <div className="w-100 d-flex justify-content-center align-items-center">
      <Chart options={options} series={series} type="radar" height={height} width="100%" />
    </div>
  );
}
