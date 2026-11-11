import { ArrowRight, CalendarDays, Database, MapPinned, Radio, Sparkles } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Collect satellite observations',
    description: 'Bring NASA FIRMS fire observations into TerraIgnis through scheduled NRT pulls, historical backfills, or manually uploaded files.',
    icon: Radio,
  },
  {
    number: '02',
    title: 'Build the fire datasets',
    description: 'Process and harmonize MODIS and VIIRS observations into the datasets used throughout the dashboard.',
    icon: Database,
  },
  {
    number: '03',
    title: 'Explore activity over time and place',
    description: 'Use the map, cell explorer, and activity calendar to inspect detections, burn index, and anomalies by location and date.',
    icon: MapPinned,
  },
];

export default function HowItWorks() {
  return (
    <section className="how-it-works-view" aria-labelledby="how-it-works-title">
      <div className="how-it-works-content">
        <div className="how-it-works-kicker"><Sparkles size={14} /> TERRAIGNIS GUIDE</div>
        <div className="how-it-works-heading-row">
          <div>
            <h1 id="how-it-works-title">How It Works</h1>
            <p>From satellite observations to a clear picture of fire activity.</p>
          </div>
          <div className="how-it-works-coming-soon">More details coming soon</div>
        </div>

        <div className="how-it-works-steps">
          {steps.map(({ number, title, description, icon: Icon }, index) => (
            <article className="how-it-works-step" key={number}>
              <div className="how-it-works-step-top">
                <span className="how-it-works-step-number">{number}</span>
                <span className="how-it-works-step-icon"><Icon size={19} /></span>
                {index < steps.length - 1 && <ArrowRight className="how-it-works-arrow" size={17} aria-hidden="true" />}
              </div>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </div>

        <div className="how-it-works-note">
          <CalendarDays size={18} />
          <p><strong>Explore at your own pace.</strong> Choose a date, year, sensor, or country in the dashboard to focus on the fire activity that matters to you.</p>
        </div>
      </div>
    </section>
  );
}
