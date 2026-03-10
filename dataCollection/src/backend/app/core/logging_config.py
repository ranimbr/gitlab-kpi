import logging


def setup_logging(debug: bool = False):

    logging.basicConfig(

        level=logging.DEBUG if debug else logging.INFO,

        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",

        handlers=[
            logging.StreamHandler(),
            logging.FileHandler("app.log", encoding="utf-8")
        ]
    )