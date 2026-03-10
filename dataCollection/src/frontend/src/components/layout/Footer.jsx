export default function Footer() {
  return (
    <footer className="footer">
      <div className="container-fluid">
        <div className="row">
          <div className="col-sm-6">{new Date().getFullYear()} © </div>
          <div className="col-sm-6">
            <div className="text-sm-end d-none d-sm-block">
              Design &amp; Develop by 
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
