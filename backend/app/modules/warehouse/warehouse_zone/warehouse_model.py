from sqlalchemy import Boolean, Column, DateTime, Integer, String, func, Text
from app.core.database import Base
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey

class Warehouse(Base):
    __tablename__ = "warehouse"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100))
    description = Column(Text)

class Zone(Base):
    __tablename__ = "zone"

    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouse.id"), nullable=False, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100))
    description = Column(Text)

    warehouse = relationship("Warehouse", lazy="joined")