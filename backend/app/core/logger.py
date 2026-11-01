import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Union
from logging.handlers import TimedRotatingFileHandler
from app.core.time import VN_TZ, vn_now

LogDir = Union[str, Path]


class VietnamFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        timestamp = datetime.fromtimestamp(record.created, VN_TZ)
        return timestamp.strftime(datefmt) if datefmt else timestamp.isoformat(timespec="milliseconds")


def setup_logger(
    name: str = "wms",
    log_level: str = "INFO",
    service_name: Optional[str] = None,
    log_dir: LogDir = "logs",
) -> logging.Logger:
    # Tạo folder log (hỗ trợ nested: logs/auth, logs/api/...)
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(name)

    if not logger.handlers:
        logger.setLevel(getattr(logging, log_level.upper()))

        formatter = VietnamFormatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )

        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        date_str = vn_now().strftime("%Y%m%d")
        log_file_name = f"{service_name or name}_{date_str}.log"
        log_file = log_path / log_file_name

        file_handler = TimedRotatingFileHandler(
            log_file,
            when="D",
            interval=1,
            backupCount=30,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


def get_logger(name: str = "wms") -> logging.Logger:
  return logging.getLogger(name)
