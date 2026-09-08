import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertOutlined,
  BellOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { MOCK_NOTIFICATIONS } from "@/data/mockNotifications";
import { useNotificationStore } from "@/store/useNotificationStore";
import type { AppNotification, NotificationTab } from "@/types/notification";
import {
  Button,
  Card,
  Input,
  cn,
  message,
} from "@/components/ui";
import {
  formatNotificationTime,
  isToday,
} from "@/utils/notificationTime";

const TYPE_CONFIG: Record<
  AppNotification["type"],
  { icon: React.ReactNode; accent: string; bg: string; label: string }
> = {
  alert: {
    icon: <WarningOutlined />,
    accent: "border-l-warning-500",
    bg: "bg-warning-50 text-warning-600",
    label: "Cảnh báo",
  },
  info: {
    icon: <InfoCircleOutlined />,
    accent: "border-l-sky-500",
    bg: "bg-sky-50 text-sky-600",
    label: "Thông tin",
  },
  success: {
    icon: <CheckCircleOutlined />,
    accent: "border-l-success-500",
    bg: "bg-success-50 text-success-600",
    label: "Thành công",
  },
  system: {
    icon: <SettingOutlined />,
    accent: "border-l-slate-400",
    bg: "bg-slate-100 text-slate-600",
    label: "Hệ thống",
  },
};

const PRIORITY_BADGE: Record<
  AppNotification["priority"],
  { label: string; className: string }
> = {
  high: {
    label: "Khẩn",
    className: "bg-red-100 text-red-700",
  },
  medium: {
    label: "Trung bình",
    className: "bg-warning-100 text-warning-700",
  },
  low: {
    label: "Thấp",
    className: "bg-slate-100 text-slate-600",
  },
};

function CategoryIcon({ category }: { category: AppNotification["category"] }) {
  const icons: Record<AppNotification["category"], React.ReactNode> = {
    inventory: <ExclamationCircleOutlined className="text-xs" />,
    inbound: <CheckCircleOutlined className="text-xs" />,
    outbound: <ClockCircleOutlined className="text-xs" />,
    audit: <AlertOutlined className="text-xs" />,
    robot: <RobotOutlined className="text-xs" />,
    system: <SettingOutlined className="text-xs" />,
  };
  return icons[category] ?? <BellOutlined className="text-xs" />;
}

function NotificationItem({
  item,
  isRead,
  isSelected,
  onSelect,
  onMarkRead,
}: {
  item: AppNotification;
  isRead: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onMarkRead: () => void;
}) {
  const navigate = useNavigate();
  const config = TYPE_CONFIG[item.type];
  const priority = PRIORITY_BADGE[item.priority];

  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        if (!isRead) onMarkRead();
      }}
      className={cn(
        "w-full border-l-4 px-5 py-4 text-left transition-all",
        config.accent,
        isSelected
          ? "bg-brand-primary/5"
          : isRead
            ? "bg-white hover:bg-gray-50/80"
            : "bg-sky-50/40 hover:bg-sky-50/70",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg",
            config.bg,
          )}
        >
          {config.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!isRead && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand-primary" />
            )}
            <h4
              className={cn(
                "text-sm text-brand-dark",
                isRead ? "font-medium" : "font-bold",
              )}
            >
              {item.title}
            </h4>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                priority.className,
              )}
            >
              {priority.label}
            </span>
          </div>

          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-500">
            {item.message}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1">
              <CategoryIcon category={item.category} />
              {item.meta}
            </span>
            <span>{formatNotificationTime(item.createdAt)}</span>
            {item.link && (
              <span
                role="link"
                tabIndex={0}
                className="font-medium text-brand-primary hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkRead();
                  navigate(item.link!);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onMarkRead();
                    navigate(item.link!);
                  }
                }}
              >
                {item.linkLabel ?? "Xem chi tiết"} →
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function NotificationPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<NotificationTab>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    MOCK_NOTIFICATIONS[0]?.id ?? null,
  );

  const { readIds, markAsRead, markAllAsRead, isRead } = useNotificationStore();

  const notifications = MOCK_NOTIFICATIONS;

  const unreadCount = useMemo(
    () => notifications.filter((n) => !isRead(n.id)).length,
    [notifications, readIds, isRead],
  );

  const alertCount = useMemo(
    () =>
      notifications.filter(
        (n) => n.type === "alert" || n.priority === "high",
      ).length,
    [notifications],
  );

  const todayCount = useMemo(
    () => notifications.filter((n) => isToday(n.createdAt)).length,
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return notifications.filter((item) => {
      if (activeTab === "unread" && isRead(item.id)) return false;
      if (activeTab === "alert" && item.type !== "alert" && item.priority !== "high") {
        return false;
      }
      if (activeTab === "system" && item.type !== "system") return false;

      if (!keyword) return true;
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.message.toLowerCase().includes(keyword) ||
        (item.meta ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [notifications, activeTab, search, readIds, isRead]);

  const selectedNotification =
    filteredNotifications.find((n) => n.id === selectedId) ??
    filteredNotifications[0] ??
    null;

  const kpiCards = [
    { label: "Tổng thông báo", value: notifications.length, color: "#168C87" },
    { label: "Chưa đọc", value: unreadCount, color: "#2F8FD8" },
    { label: "Cảnh báo", value: alertCount, color: "#d97706" },
    { label: "Hôm nay", value: todayCount, color: "#17363A" },
  ];

  const TABS: {
    key: NotificationTab;
    label: string;
    icon: React.ComponentType;
    count: number;
    activeBadge: string;
  }[] = [
    {
      key: "all",
      label: "Tất cả",
      icon: BellOutlined,
      count: notifications.length,
      activeBadge: "bg-brand-primary/15 text-brand-primary",
    },
    {
      key: "unread",
      label: "Chưa đọc",
      icon: ExclamationCircleOutlined,
      count: unreadCount,
      activeBadge: "bg-sky-100 text-sky-700",
    },
    {
      key: "alert",
      label: "Cảnh báo",
      icon: WarningOutlined,
      count: alertCount,
      activeBadge: "bg-warning-100 text-warning-700",
    },
    {
      key: "system",
      label: "Hệ thống",
      icon: SettingOutlined,
      count: notifications.filter((n) => n.type === "system").length,
      activeBadge: "bg-slate-200 text-slate-700",
    },
  ];

  const handleMarkAllRead = () => {
    markAllAsRead(notifications.map((n) => n.id));
    message.success("Đã đánh dấu tất cả là đã đọc");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-dark">Thông báo</h2>
          <p className="mt-1 text-sm text-gray-400">
            Cập nhật hoạt động kho, cảnh báo và sự kiện hệ thống
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            icon={<CheckOutlined />}
            onClick={handleMarkAllRead}
          >
            Đánh dấu tất cả đã đọc ({unreadCount})
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold" style={{ color: card.color }}>
              {card.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="shadow-sm border-gray-100/50 rounded-xl overflow-hidden p-0 xl:col-span-3">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-primary/10 text-brand-primary"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700",
                  )}
                >
                  <Icon />
                  {tab.label}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      isActive ? tab.activeBadge : "bg-panel-soft text-stripe-ink-mute",
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-b border-gray-100 px-5 py-4">
            <Input
              allowClear
              prefix={<SearchOutlined className="text-gray-400" />}
              placeholder="Tìm theo tiêu đề, nội dung, danh mục..."
              className="!w-full max-w-md"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-[560px] divide-y divide-gray-100 overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-panel-soft text-2xl text-stripe-ink-mute">
                  <BellOutlined />
                </div>
                <p className="font-medium text-brand-dark">Không có thông báo</p>
                <p className="mt-1 text-sm text-gray-400">
                  Thử đổi bộ lọc hoặc từ khóa tìm kiếm
                </p>
              </div>
            ) : (
              filteredNotifications.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  isRead={isRead(item.id)}
                  isSelected={selectedNotification?.id === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  onMarkRead={() => markAsRead(item.id)}
                />
              ))
            )}
          </div>
        </Card>

        <Card className="shadow-sm border-gray-100/50 rounded-xl p-5 xl:col-span-2">
          <h3 className="mb-4 text-base font-semibold text-brand-dark">
            Chi tiết thông báo
          </h3>

          {selectedNotification ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl",
                    TYPE_CONFIG[selectedNotification.type].bg,
                  )}
                >
                  {TYPE_CONFIG[selectedNotification.type].icon}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                        TYPE_CONFIG[selectedNotification.type].bg,
                      )}
                    >
                      {TYPE_CONFIG[selectedNotification.type].label}
                    </span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                        PRIORITY_BADGE[selectedNotification.priority].className,
                      )}
                    >
                      {PRIORITY_BADGE[selectedNotification.priority].label}
                    </span>
                  </div>
                  <h4 className="mt-2 text-lg font-bold text-brand-dark">
                    {selectedNotification.title}
                  </h4>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-gray-600">
                {selectedNotification.message}
              </p>

              <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-gray-200 py-2">
                  <span className="text-gray-400">Danh mục</span>
                  <span className="font-medium text-brand-dark">
                    {selectedNotification.meta ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-b border-gray-200 py-2">
                  <span className="text-gray-400">Thời gian</span>
                  <span className="font-medium text-brand-dark">
                    {formatNotificationTime(selectedNotification.createdAt)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <span className="text-gray-400">Trạng thái</span>
                  <span className="font-medium text-brand-dark">
                    {isRead(selectedNotification.id) ? "Đã đọc" : "Chưa đọc"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {!isRead(selectedNotification.id) && (
                  <Button
                    variant="secondary"
                    icon={<CheckOutlined />}
                    onClick={() => {
                      markAsRead(selectedNotification.id);
                      message.success("Đã đánh dấu đã đọc");
                    }}
                  >
                    Đánh dấu đã đọc
                  </Button>
                )}
                {selectedNotification.link && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      markAsRead(selectedNotification.id);
                      navigate(selectedNotification.link!);
                    }}
                  >
                    {selectedNotification.linkLabel ?? "Xem chi tiết"}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Chọn một thông báo để xem chi tiết
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
