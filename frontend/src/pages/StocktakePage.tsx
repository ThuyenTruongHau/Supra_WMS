import { useState, useEffect } from 'react';
import { Card, Table, Button, Input, Space, message, Select, Modal } from '@/components/ui';
import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  HistoryOutlined,
  ReloadOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { Tabs, Tag, Row, Col, Checkbox } from 'antd';
import Hero from '@/components/shared/Hero';
import { useAppStore } from '@/store/useAppStore';
import {
  getMockLocations,
  getMockAdjustments,
  submitMockStocktake,
  approveMockAdjustment,
  rejectMockAdjustment,
  getMockStocktakePlans,
  createMockStocktakePlan,
  completeMockStocktakePlan,
  MockStocktakeLocation,
  MockStockAdjustment,
  MockStocktakePlan
} from '@/api/stocktakeMock';

export default function StocktakePage() {
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);
  const [locations, setLocations] = useState<MockStocktakeLocation[]>([]);
  const [adjustments, setAdjustments] = useState<MockStockAdjustment[]>([]);
  const [plans, setPlans] = useState<MockStocktakePlan[]>([]);

  // Execution Tab State
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [inputValues, setInputValues] = useState<Record<string, { actualQty?: number, reason: string }>>({});

  // Create Plan Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [selectedLocationsToPlan, setSelectedLocationsToPlan] = useState<string[]>([]);

  // Load and Filter Data by selectedWarehouseId
  const loadData = () => {
    const allLocations = getMockLocations();
    const filteredLocations = allLocations.filter(loc => loc.warehouseId === selectedWarehouseId);
    setLocations(filteredLocations);

    const allAdjustments = getMockAdjustments();
    const filteredAdjustments = allAdjustments.filter(adj => adj.warehouseId === selectedWarehouseId);
    setAdjustments(filteredAdjustments);

    const allPlans = getMockStocktakePlans();
    const filteredPlans = allPlans.filter(p => p.warehouseId === selectedWarehouseId);
    setPlans(filteredPlans);

    // Sync inputValues with already checked items in the selected plan
    if (selectedPlanId) {
      const currentPlan = filteredPlans.find(p => p.id === selectedPlanId);
      if (currentPlan) {
        const initialInputs: Record<string, { actualQty?: number, reason: string }> = {};
        currentPlan.locations.forEach(l => {
          if (l.isChecked && l.actualQty !== undefined) {
            // Find the reason from adjustments
            const adj = filteredAdjustments.find(a => a.planId === currentPlan.id && a.locationCode === l.locationCode);
            initialInputs[l.locationCode] = {
              actualQty: l.actualQty,
              reason: adj?.reason || ''
            };
          }
        });
        setInputValues(prev => ({ ...prev, ...initialInputs }));
      }
    }
  };

  useEffect(() => {
    loadData();
    setSelectedPlanId('');
    setInputValues({});
  }, [selectedWarehouseId]);

  // Submit Stocktake Row
  const handleSubmitRow = (record: any) => {
    const input = inputValues[record.locationCode];
    if (!input || input.actualQty === undefined) {
      message.error('Vui lòng nhập số lượng đếm thực tế!');
      return;
    }
    if (input.actualQty !== record.systemQty && !input.reason) {
      message.error('Vui lòng nhập lý do chênh lệch!');
      return;
    }

    try {
      submitMockStocktake({
        locationCode: record.locationCode,
        actualQty: input.actualQty,
        reason: input.reason || '',
        countedBy: 'Lâm Văn A (Nhân viên)',
        planId: selectedPlanId
      });
      message.success(`Đã ghi nhận vị trí ${record.locationCode}`);
      loadData();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi gửi kiểm kê');
    }
  };

  const handleQuickMatch = (record: any) => {
    try {
      submitMockStocktake({
        locationCode: record.locationCode,
        actualQty: record.systemQty,
        reason: 'Kiểm kê khớp (0 chênh lệch)',
        countedBy: 'Lâm Văn A (Nhân viên)',
        planId: selectedPlanId
      });

      setInputValues(prev => ({
        ...prev,
        [record.locationCode]: { actualQty: record.systemQty, reason: 'Kiểm kê khớp (0 chênh lệch)' }
      }));

      message.success(`Đã khớp nhanh vị trí ${record.locationCode}`);
      loadData();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi khớp nhanh');
    }
  };

  // Complete Plan
  const handleCompletePlan = (plan: MockStocktakePlan) => {
    const uncheckedCount = plan.locations.filter(l => !l.isChecked).length;
    if (uncheckedCount > 0) {
      Modal.confirm({
        title: 'Xác nhận chốt sổ',
        content: `Còn ${uncheckedCount} vị trí chưa kiểm. Bạn có chắc chắn muốn chốt sổ phiếu này? Những vị trí này sẽ bị bỏ qua.`,
        okText: 'Chốt sổ',
        cancelText: 'Hủy',
        onOk: () => {
          completeMockStocktakePlan(plan.id);
          message.success('Đã hoàn tất phiếu kiểm kê!');
          if (selectedPlanId === plan.id) setSelectedPlanId('');
          loadData();
        }
      });
    } else {
      completeMockStocktakePlan(plan.id);
      message.success('Đã hoàn tất phiếu kiểm kê!');
      if (selectedPlanId === plan.id) setSelectedPlanId('');
      loadData();
    }
  };

  // Create Plan
  const handleCreatePlan = () => {
    if (!newPlanName) {
      message.error('Vui lòng nhập tên phiếu kiểm kê!');
      return;
    }
    if (selectedLocationsToPlan.length === 0) {
      message.error('Vui lòng chọn ít nhất 1 vị trí!');
      return;
    }
    createMockStocktakePlan(newPlanName, selectedWarehouseId, selectedLocationsToPlan);
    message.success('Tạo phiếu kiểm kê thành công!');
    setIsCreateModalOpen(false);
    setNewPlanName('');
    setSelectedLocationsToPlan([]);
    loadData();
  };

  // Approve / Reject
  const handleApprove = (id: string) => {
    try {
      approveMockAdjustment(id);
      message.success(`Đã phê duyệt yêu cầu điều chỉnh ${id}`);
      loadData();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi duyệt');
    }
  };

  const handleReject = (id: string) => {
    try {
      rejectMockAdjustment(id);
      message.warning(`Đã từ chối yêu cầu điều chỉnh ${id}`);
      loadData();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi từ chối');
    }
  };

  // Hero Stats
  const totalPending = adjustments.filter(adj => adj.status === 'Pending').length;
  const totalAdjustedQty = adjustments
    .filter(adj => adj.status === 'Approved')
    .reduce((sum, adj) => sum + Math.abs(adj.variance), 0);

  const activePlansCount = plans.filter(p => p.status !== 'Completed').length;
  const completedPlansCount = plans.filter(p => p.status === 'Completed').length;

  const heroStats = [
    { label: 'Phiếu kiểm kê đang thực hiện', value: `${activePlansCount}`, color: '#1890ff' },
    { label: 'Phiếu kiểm kê đã hoàn thành', value: `${completedPlansCount}`, color: '#722ed1' },
    { label: 'Chênh lệch chờ duyệt', value: `${totalPending}`, color: '#faad14' },
    { label: 'Chênh lệch đã duyệt', value: `${totalAdjustedQty} kg`, color: '#52c41a' },
  ];

  // Execution Table Data
  const currentPlan = plans.find(p => p.id === selectedPlanId);
  const executionTableData = currentPlan ? currentPlan.locations.map(pl => {
    const locDetail = locations.find(l => l.locationCode === pl.locationCode);
    return {
      ...locDetail,
      isChecked: pl.isChecked,
      actualQtySaved: pl.actualQty
    };
  }).filter(Boolean) : [];

  const executionColumns = [
    {
      title: 'Vị trí',
      dataIndex: 'locationCode',
      key: 'locationCode',
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: 'Thông tin sản phẩm',
      key: 'product',
      render: (_: any, record: any) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.productName}</div>
          <span style={{ fontSize: '12px', color: '#8c8c8c' }}>SKU: {record.sku}</span>
        </div>
      )
    },
    {
      title: 'Hệ thống',
      dataIndex: 'systemQty',
      key: 'systemQty',
      render: (val: number, record: any) => `${val} ${record.unit}`
    },
    {
      title: 'Đếm thực tế',
      key: 'actualQty',
      width: 150,
      render: (_: any, record: any) => (
        <Input
          type="number"
          placeholder="Nhập SL..."
          value={inputValues[record.locationCode]?.actualQty ?? ''}
          onChange={(e) => setInputValues(prev => ({
            ...prev,
            [record.locationCode]: { ...prev[record.locationCode], actualQty: e.target.value ? Number(e.target.value) : undefined }
          }))}
          style={{ borderColor: record.isChecked ? '#52c41a' : undefined, backgroundColor: record.isChecked ? '#f6ffed' : undefined }}
        />
      )
    },
    {
      title: 'Lý do chênh lệch',
      key: 'reason',
      width: 200,
      render: (_: any, record: any) => (
        <Input
          placeholder="Nếu lệch..."
          value={inputValues[record.locationCode]?.reason || ''}
          onChange={(e) => setInputValues(prev => ({
            ...prev,
            [record.locationCode]: { ...prev[record.locationCode], reason: e.target.value }
          }))}
        />
      )
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, record: any) => {
        if (record.isChecked) {
          return (
            <Space>
              <Tag color="success">Đã ghi nhận</Tag>
              <Button size="small" style={{ borderColor: '#faad14', color: '#faad14' }} onClick={() => handleSubmitRow(record)}>
                Cập nhật
              </Button>
            </Space>
          );
        }
        return (
          <Space>
            <Button size="small" style={{ backgroundColor: '#52c41a', color: 'white', borderColor: '#52c41a' }} onClick={() => handleQuickMatch(record)}>
              Khớp Nhanh
            </Button>
            <Button size="small" variant="primary" onClick={() => handleSubmitRow(record)}>
              Gửi
            </Button>
          </Space>
        );
      }
    }
  ];

  // Management Columns
  const planColumns = [
    {
      title: 'Mã phiếu',
      dataIndex: 'id',
      key: 'id',
      render: (text: string) => <strong style={{ color: '#1890ff' }}>{text}</strong>
    },
    { title: 'Tên phiếu', dataIndex: 'name', key: 'name' },
    { title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt' },
    {
      title: 'Tiến độ',
      key: 'progress',
      render: (_: any, record: MockStocktakePlan) => {
        const checked = record.locations.filter(l => l.isChecked).length;
        const total = record.locations.length;
        return <span>{checked} / {total} vị trí</span>;
      }
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        if (status === 'Completed') return <Tag color="success">Hoàn thành</Tag>;
        if (status === 'InProgress') return <Tag color="processing">Đang thực hiện</Tag>;
        return <Tag color="default">Chờ xử lý</Tag>;
      }
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, record: MockStocktakePlan) => {
        if (record.status === 'Completed') return null;
        return (
          <Button size="small" danger onClick={() => handleCompletePlan(record)}>Hoàn tất phiếu</Button>
        );
      }
    }
  ];

  // Nested Table for Plan Locations
  const expandedRowRender = (record: MockStocktakePlan) => {
    const subColumns = [
      { title: 'Vị trí', dataIndex: 'locationCode', key: 'locationCode', render: (text: string) => <Tag color="blue">{text}</Tag> },
      { title: 'Trạng thái đếm', key: 'status', render: (_: any, pl: any) => {
        if (!pl.isChecked) return <Tag color="default">Chờ kiểm</Tag>;
        const adj = adjustments.find(a => a.planId === record.id && a.locationCode === pl.locationCode);
        if (!adj) return <Tag color="default">Chưa rõ</Tag>;
        if (adj.variance === 0) return <Tag color="success">Khớp số liệu</Tag>;
        return <Tag color="error">Chênh lệch</Tag>;
      }},
      { title: 'Số lượng thực tế', key: 'actualQty', render: (_: any, pl: any) => pl.isChecked && pl.actualQty !== undefined ? `${pl.actualQty}` : '-' },
      { title: 'Chi tiết chênh lệch', key: 'varianceDetail', render: (_: any, pl: any) => {
        if (!pl.isChecked) return '-';
        const adj = adjustments.find(a => a.planId === record.id && a.locationCode === pl.locationCode);
        if (!adj || adj.variance === 0) return '-';
        const prefix = adj.variance > 0 ? '+' : '';
        return (
          <div>
            <span style={{ color: adj.variance > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>{prefix}{adj.variance} {adj.unit}</span>
            <div style={{ fontSize: '12px', color: '#8c8c8c', fontStyle: 'italic', marginTop: '4px' }}>Lý do: {adj.reason}</div>
          </div>
        );
      }},
      { title: 'Duyệt / Trạng thái', key: 'actions', render: (_: any, pl: any) => {
        if (!pl.isChecked) return '-';
        const adj = adjustments.find(a => a.planId === record.id && a.locationCode === pl.locationCode);
        if (!adj) return '-';
        if (adj.variance === 0) return <Tag color="success" icon={<CheckCircleOutlined />}>Đã tự động duyệt</Tag>;
        
        if (adj.status === 'Approved') return <Tag color="success" icon={<CheckCircleOutlined />}>Đã duyệt</Tag>;
        if (adj.status === 'Rejected') return <Tag color="error" icon={<CloseCircleOutlined />}>Đã từ chối</Tag>;
  
        return (
          <Space size="small">
            <Button size="small" style={{ backgroundColor: '#52c41a', color: 'white', borderColor: '#52c41a' }} onClick={() => handleApprove(adj.id)}>
              Duyệt
            </Button>
            <Button size="small" danger onClick={() => handleReject(adj.id)}>
              Từ chối
            </Button>
          </Space>
        );
      }}
    ];
  
    return (
      <Table 
        columns={subColumns} 
        dataSource={record.locations} 
        rowKey="locationCode" 
        pagination={false} 
        size="small" 
        style={{ margin: '10px 0', border: '1px solid #e8e8e8', borderRadius: '4px' }}
      />
    );
  };

  const itemsTab = [
    {
      key: 'staff',
      label: (
        <span>
          <AuditOutlined />
          Thực hiện kiểm kê
        </span>
      ),
      children: (
        <Card style={{ marginTop: '16px' }}>
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontWeight: 'bold' }}>Chọn phiếu kiểm kê:</span>
            <Select
              placeholder="Chọn phiếu để bắt đầu..."
              style={{ width: '300px' }}
              value={selectedPlanId || undefined}
              onChange={(val) => setSelectedPlanId(val)}
              options={plans.filter(p => p.status !== 'Completed').map(p => ({
                value: p.id,
                label: `${p.id} - ${p.name}`
              }))}
            />
            <Button onClick={loadData} icon={<ReloadOutlined />}>Làm mới</Button>
          </div>

          {selectedPlanId ? (
            <Table
              dataSource={executionTableData}
              columns={executionColumns}
              rowKey="locationCode"
              pagination={false}
              locale={{ emptyText: 'Phiếu này không có dữ liệu vị trí.' }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
              Vui lòng chọn một phiếu kiểm kê từ danh sách để bắt đầu đếm số lượng.
            </div>
          )}
        </Card>
      )
    },
    {
      key: 'manager',
      label: (
        <span>
          <HistoryOutlined />
          Quản lý & Lịch sử kiểm kê
        </span>
      ),
      children: (
        <div>
          <Card 
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Danh sách Phiếu Kiểm Kê</span>
                <Space>
                  <Button onClick={loadData} icon={<ReloadOutlined />}>Làm mới</Button>
                  <Button variant="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>
                    Tạo phiếu mới
                  </Button>
                </Space>
              </div>
            }
            style={{ marginTop: '16px', marginBottom: '24px' }} 
          >
            <Table
              dataSource={plans}
              columns={planColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              expandable={{ expandedRowRender, defaultExpandAllRows: false }}
            />
          </Card>
        </div>
      )
    }
  ];

  return (
    <div>
      <Hero title="Kiểm Kê Kho" list={heroStats} />

      <div style={{ padding: '0 24px 24px 24px', marginTop: '40px' }}>
        <Card style={{ borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <Tabs defaultActiveKey="staff" items={itemsTab} />
        </Card>
      </div>

      <Modal
        title="Tạo Phiếu Kiểm Kê Mới"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          setNewPlanName('');
          setSelectedLocationsToPlan([]);
        }}
        onOk={handleCreatePlan}
        okText="Tạo Phiếu"
        cancelText="Hủy"
        width={600}
      >
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Tên phiếu kiểm kê:</label>
          <Input
            placeholder="Ví dụ: Kiểm kê định kỳ kho 1 - Lần 1"
            value={newPlanName}
            onChange={(e) => setNewPlanName(e.target.value)}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Chọn các vị trí cần kiểm tra:</label>
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #d9d9d9', padding: '8px', borderRadius: '4px' }}>
            <Checkbox.Group
              style={{ width: '100%' }}
              value={selectedLocationsToPlan}
              onChange={(values) => setSelectedLocationsToPlan(values as string[])}
            >
              <Row gutter={[0, 8]}>
                {locations.map(loc => (
                  <Col span={24} key={loc.locationCode}>
                    <Checkbox value={loc.locationCode}>
                      {loc.locationCode} - {loc.productName} (Tồn: {loc.systemQty})
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </div>
        </div>
      </Modal>
    </div>
  );
}
