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
        'Mentorat (Commentaires)',
        'Expertise (Revues)',
        'Qualité (Approbation)',
        'Production (MRs/Commits)',
        'Vélocité (Merges)'
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
    const mentorScore = Math.min((snapshot.total_comments || 0) * 10, 100);
    const expertScore = Math.min((snapshot.total_reviews || 0) * 33.3, 100);
    const qualityScore = (snapshot.approved_mr_rate || 0) * 100;
    const prodScore = Math.min(((snapshot.total_mrs_created || 0) * 20) + ((snapshot.total_commits || 0) * 2), 100);
    const velocityScore = (snapshot.merged_mr_rate || 0) * 100;

    return [{
      name: "Profil Expert (%)",
      data: [
        Math.round(mentorScore),
        Math.round(expertScore),
        Math.round(qualityScore),
        Math.round(prodScore),
        Math.round(velocityScore)
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
