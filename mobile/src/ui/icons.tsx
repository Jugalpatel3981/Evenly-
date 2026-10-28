// Lucide icons (ISC licence), imported one by one so the app only carries the ones it uses.
import type { LucideProps } from 'lucide-react-native';
import type { ComponentType } from 'react';

import Users from 'lucide-react-native/icons/users';
import User from 'lucide-react-native/icons/user';
import UserPlus from 'lucide-react-native/icons/user-plus';
import Activity from 'lucide-react-native/icons/activity';
import CircleUser from 'lucide-react-native/icons/circle-user';
import Search from 'lucide-react-native/icons/search';
import Receipt from 'lucide-react-native/icons/receipt';
import Wallet from 'lucide-react-native/icons/wallet';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import Plane from 'lucide-react-native/icons/plane';
import House from 'lucide-react-native/icons/house';
import Heart from 'lucide-react-native/icons/heart';
import LogOut from 'lucide-react-native/icons/log-out';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Trash from 'lucide-react-native/icons/trash';
import EighthNotes from 'lucide-react-native/icons/eighth-notes';
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import Bell from 'lucide-react-native/icons/bell';
import Moon from 'lucide-react-native/icons/moon';
import Sun from 'lucide-react-native/icons/sun';
import Monitor from 'lucide-react-native/icons/monitor';
import X from 'lucide-react-native/icons/x';
import Check from 'lucide-react-native/icons/check';
import Mail from 'lucide-react-native/icons/mail';
import Lock from 'lucide-react-native/icons/lock';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import Plus from 'lucide-react-native/icons/plus';
import Camera from 'lucide-react-native/icons/camera';
import Gamepad2 from 'lucide-react-native/icons/gamepad-2';
import Clapperboard from 'lucide-react-native/icons/clapperboard';
import Trophy from 'lucide-react-native/icons/trophy';
import Ticket from 'lucide-react-native/icons/ticket';
import Utensils from 'lucide-react-native/icons/utensils';
import ShoppingBasket from 'lucide-react-native/icons/shopping-basket';
import Wine from 'lucide-react-native/icons/wine';
import Coffee from 'lucide-react-native/icons/coffee';
import Sofa from 'lucide-react-native/icons/sofa';
import SprayCan from 'lucide-react-native/icons/spray-can';
import Wrench from 'lucide-react-native/icons/wrench';
import Landmark from 'lucide-react-native/icons/landmark';
import PawPrint from 'lucide-react-native/icons/paw-print';
import HandHelping from 'lucide-react-native/icons/hand-helping';
import Lamp from 'lucide-react-native/icons/lamp';
import Baby from 'lucide-react-native/icons/baby';
import Shirt from 'lucide-react-native/icons/shirt';
import GraduationCap from 'lucide-react-native/icons/graduation-cap';
import Gift from 'lucide-react-native/icons/gift';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Stethoscope from 'lucide-react-native/icons/stethoscope';
import Bike from 'lucide-react-native/icons/bike';
import TramFront from 'lucide-react-native/icons/tram-front';
import Car from 'lucide-react-native/icons/car';
import Fuel from 'lucide-react-native/icons/fuel';
import Hotel from 'lucide-react-native/icons/hotel';
import SquareParking from 'lucide-react-native/icons/square-parking';
import CarTaxiFront from 'lucide-react-native/icons/car-taxi-front';
import Route from 'lucide-react-native/icons/route';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Zap from 'lucide-react-native/icons/zap';
import Flame from 'lucide-react-native/icons/flame';
import Wifi from 'lucide-react-native/icons/wifi';
import Droplets from 'lucide-react-native/icons/droplets';
import Plug from 'lucide-react-native/icons/plug';
import Tag from 'lucide-react-native/icons/tag';
import Groceries from 'lucide-react-native/icons/groceries';

const ICONS: Record<string, ComponentType<LucideProps>> = {
  'users': Users,
  'user': User,
  'user-plus': UserPlus,
  'activity': Activity,
  'circle-user': CircleUser,
  'search': Search,
  'receipt': Receipt,
  'wallet': Wallet,
  'sliders-horizontal': SlidersHorizontal,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'plane': Plane,
  'house': House,
  'heart': Heart,
  'log-out': LogOut,
  'message-square': MessageSquare,
  'trash': Trash,
  'arrow-left-right': ArrowLeftRight,
  'bell': Bell,
  'moon': Moon,
  'sun': Sun,
  'monitor': Monitor,
  'x': X,
  'check': Check,
  'mail': Mail,
  'lock': Lock,
  'rotate-ccw': RotateCcw,
  'plus': Plus,
  'camera': Camera,
  'gamepad-2': Gamepad2,
  'clapperboard': Clapperboard,
  'trophy': Trophy,
  'ticket': Ticket,
  'utensils': Utensils,
  'shopping-basket': ShoppingBasket,
  'wine': Wine,
  'coffee': Coffee,
  'sofa': Sofa,
  'spray-can': SprayCan,
  'wrench': Wrench,
  'landmark': Landmark,
  'paw-print': PawPrint,
  'hand-helping': HandHelping,
  'lamp': Lamp,
  'baby': Baby,
  'shirt': Shirt,
  'graduation-cap': GraduationCap,
  'gift': Gift,
  'shield-check': ShieldCheck,
  'stethoscope': Stethoscope,
  'bike': Bike,
  'tram-front': TramFront,
  'car': Car,
  'fuel': Fuel,
  'hotel': Hotel,
  'square-parking': SquareParking,
  'car-taxi-front': CarTaxiFront,
  'route': Route,
  'sparkles': Sparkles,
  'zap': Zap,
  'flame': Flame,
  'wifi': Wifi,
  'droplets': Droplets,
  'plug': Plug,
  'tag': Tag,
  'groceries': Groceries,
  // Names the web app used, now renamed in Lucide.
  'trash-2': Trash,
  'music': EighthNotes,
};

export type IconName = keyof typeof ICONS | string;
export function Icon({name, size = 20, color, strokeWidth = 2}: {name: IconName; size?: number; color: string; strokeWidth?: number}){
  const C = ICONS[name] || ICONS.tag;
  return <C size={size} color={color} strokeWidth={strokeWidth} />;
}
